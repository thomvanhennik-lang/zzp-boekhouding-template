-- Internal primitive only: no browser/API grants and no live release.
alter table public.invoices add column revision bigint not null default 0 check(revision>=0);
create function private.bump_invoice_revision() returns trigger language plpgsql set search_path='' as $$
begin NEW.revision:=OLD.revision+1; return NEW; end; $$;
revoke all on function private.bump_invoice_revision() from public,anon,authenticated;
create trigger invoice_revision before update on public.invoices for each row execute function private.bump_invoice_revision();
create function private.protect_invoice_line() returns trigger language plpgsql set search_path='' as $$
declare parent uuid;
begin
 if TG_OP='INSERT' then parent:=NEW.invoice_id; else parent:=OLD.invoice_id; end if;
 perform 1 from public.invoices where id=parent and status='posted' for update;
 if found then raise exception 'Posted invoice lines are immutable'; end if;
 if TG_OP='UPDATE' and NEW.invoice_id<>OLD.invoice_id then
  perform 1 from public.invoices where id=NEW.invoice_id and status='posted' for update;
  if found then raise exception 'Posted invoice lines are immutable'; end if;
 end if;
 -- A line edit changes the version that the user must review.
 update public.invoices set revision=revision where id=parent;
 if TG_OP='UPDATE' and NEW.invoice_id<>OLD.invoice_id then update public.invoices set revision=revision where id=NEW.invoice_id; end if;
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end; $$;
revoke all on function private.protect_invoice_line() from public,anon,authenticated;
create trigger protect_invoice_lines before insert or update or delete on public.invoice_lines for each row execute function private.protect_invoice_line();
create function private.post_sale(p_invoice uuid,p_revision bigint,p_confirmed boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare i public.invoices; admin uuid; entry uuid; serial bigint; yr text; cnt int; net numeric; vat numeric;
begin
 if p_confirmed is distinct from true then raise exception 'CONFIRM_REQUIRED'; end if;
 if not private.is_owner() then raise exception 'UNAUTHORIZED'; end if;
 select administration_id into admin from public.invoices where id=p_invoice and owner_id=auth.uid();
 if admin is null then raise exception 'NOT_FOUND'; end if;
 -- All numbering operations lock the same administration before the invoice.
 perform 1 from public.administrations where id=admin and owner_id=auth.uid() for update;
 select * into i from public.invoices where id=p_invoice and owner_id=auth.uid() for update;
 if i.kind<>'sale' then raise exception 'SALE_REQUIRED'; end if;
 if i.status='posted' then
  select id into entry from public.journal_entries where invoice_id=i.id and idempotency_key='invoice:'||i.id::text;
  if entry is null or p_revision is distinct from i.revision-1 then raise exception 'REVISION_CONFLICT'; end if;
  return jsonb_build_object('number',i.number,'entryId',entry,'revision',i.revision);
 end if;
 if p_revision is distinct from i.revision then raise exception 'REVISION_CONFLICT'; end if;
 if i.currency<>'EUR' or i.vat_code<>'NL21' or i.net_cents<=0 then raise exception 'UNSUPPORTED_SALE'; end if;
 perform 1 from public.contacts where id=i.contact_id and kind='customer' and country='NL' and length(trim(name))>0 and length(trim(address))>0;
 if not found then raise exception 'INVALID_CUSTOMER'; end if;
 perform 1 from public.periods where administration_id=admin and i.invoice_date between starts_on and ends_on and status='open' for share;
 if not found then raise exception 'NO_OPEN_PERIOD'; end if;
 select count(*),sum(net_cents),sum(vat_cents) into cnt,net,vat from public.invoice_lines where invoice_id=i.id;
 if cnt=0 or net<>i.net_cents or vat<>i.vat_cents or exists(select 1 from public.invoice_lines where invoice_id=i.id and (net_cents<=0 or vat_cents<>round(net_cents::numeric*21/100) or length(trim(description))<3)) then raise exception 'INVALID_LINES'; end if;
 yr:=extract(year from i.invoice_date)::text;
 select coalesce(max(split_part(number,'-',2)::bigint),0)+1 into serial from public.invoices where administration_id=admin and kind='sale' and number ~ ('^'||yr||'-[0-9]+$');
 i.number:=yr||'-'||lpad(serial::text,greatest(3,length(serial::text)),'0');
 insert into public.journal_entries(owner_id,administration_id,invoice_id,entry_date,description,idempotency_key)
 values(i.owner_id,admin,i.id,i.invoice_date,'Verkoop '||i.number,'invoice:'||i.id::text) returning id into entry;
 insert into public.journal_lines(owner_id,administration_id,entry_id,account_code,amount_cents)
 values(i.owner_id,admin,entry,'1300',i.gross_cents),(i.owner_id,admin,entry,'8000',-i.net_cents);
 if i.vat_cents=0 then update public.journal_lines set vat_box='1a',tax_base_cents=i.net_cents,tax_cents=0 where entry_id=entry and account_code='8000'; end if;
 if i.vat_cents<>0 then
 insert into public.journal_lines(owner_id,administration_id,entry_id,account_code,amount_cents,vat_box,tax_base_cents,tax_cents)
 values(i.owner_id,admin,entry,'1520',-i.vat_cents,'1a',i.net_cents,i.vat_cents);
 end if;
 update public.journal_entries set status='posted' where id=entry;
 update public.invoices set number=i.number,status='posted' where id=i.id;
 insert into public.audit_events(owner_id,administration_id,actor_id,action,entity_id,detail)
 values(i.owner_id,admin,auth.uid(),'sale_posted',i.id,jsonb_build_object('entryId',entry,'number',i.number,'approvedRevision',p_revision));
 return jsonb_build_object('number',i.number,'entryId',entry,'revision',i.revision+1);
end; $$;
revoke all on function private.post_sale(uuid,bigint,boolean) from public,anon,authenticated;
