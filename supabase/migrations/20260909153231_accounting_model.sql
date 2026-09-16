-- Normalized accounting foundation. Client writes remain denied.
alter table public.administrations add unique(id, owner_id);
create table public.contacts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 administration_id uuid not null, created_at timestamptz not null default now(),
 unique(id,owner_id,administration_id),
 foreign key(administration_id,owner_id) references public.administrations(id,owner_id),
 name text not null, address text not null, email text not null, country text not null, kind text not null check(kind in ('customer','supplier'))
);
alter table public.contacts enable row level security;
revoke all on public.contacts from public,anon,authenticated;
grant select on public.contacts to authenticated;
create policy owner_read on public.contacts for select to authenticated using ((select private.is_owner()) and owner_id=(select auth.uid()));
create index contacts_owner_idx on public.contacts(owner_id,administration_id);
create table public.documents (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 administration_id uuid not null, created_at timestamptz not null default now(),
 unique(id,owner_id,administration_id),
 foreign key(administration_id,owner_id) references public.administrations(id,owner_id),
 object_path text not null unique, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), mime_type text not null, size_bytes bigint not null check(size_bytes>0), retain_until date not null, unique(administration_id, sha256)
);
alter table public.documents enable row level security;
revoke all on public.documents from public,anon,authenticated;
grant select on public.documents to authenticated;
create policy owner_read on public.documents for select to authenticated using ((select private.is_owner()) and owner_id=(select auth.uid()));
create index documents_owner_idx on public.documents(owner_id,administration_id);
create table public.periods (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 administration_id uuid not null, created_at timestamptz not null default now(),
 unique(id,owner_id,administration_id),
 foreign key(administration_id,owner_id) references public.administrations(id,owner_id),
 period text not null, starts_on date not null, ends_on date not null, status text not null default 'open' check(status in ('open','closed')), check(ends_on>=starts_on), unique(administration_id,period)
);
alter table public.periods enable row level security;
revoke all on public.periods from public,anon,authenticated;
grant select on public.periods to authenticated;
create policy owner_read on public.periods for select to authenticated using ((select private.is_owner()) and owner_id=(select auth.uid()));
create index periods_owner_idx on public.periods(owner_id,administration_id);
create table public.invoices (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 administration_id uuid not null, created_at timestamptz not null default now(),
 unique(id,owner_id,administration_id),
 foreign key(administration_id,owner_id) references public.administrations(id,owner_id),
 contact_id uuid not null, document_id uuid, kind text not null check(kind in ('sale','purchase')), number text, invoice_date date not null, service_date date not null, due_date date not null, status text not null default 'draft' check(status in ('draft','posted')), net_cents bigint not null, vat_cents bigint not null, gross_cents bigint not null, currency text not null default 'EUR', vat_code text not null, check(net_cents+vat_cents=gross_cents), foreign key(contact_id,owner_id,administration_id) references public.contacts(id,owner_id,administration_id), foreign key(document_id,owner_id,administration_id) references public.documents(id,owner_id,administration_id)
);
alter table public.invoices enable row level security;
revoke all on public.invoices from public,anon,authenticated;
grant select on public.invoices to authenticated;
create policy owner_read on public.invoices for select to authenticated using ((select private.is_owner()) and owner_id=(select auth.uid()));
create index invoices_owner_idx on public.invoices(owner_id,administration_id);
create table public.invoice_lines (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 administration_id uuid not null, created_at timestamptz not null default now(),
 unique(id,owner_id,administration_id),
 foreign key(administration_id,owner_id) references public.administrations(id,owner_id),
 invoice_id uuid not null, description text not null, net_cents bigint not null, vat_cents bigint not null, foreign key(invoice_id,owner_id,administration_id) references public.invoices(id,owner_id,administration_id)
);
alter table public.invoice_lines enable row level security;
revoke all on public.invoice_lines from public,anon,authenticated;
grant select on public.invoice_lines to authenticated;
create policy owner_read on public.invoice_lines for select to authenticated using ((select private.is_owner()) and owner_id=(select auth.uid()));
create index invoice_lines_owner_idx on public.invoice_lines(owner_id,administration_id);
create table public.journal_entries (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 administration_id uuid not null, created_at timestamptz not null default now(),
 unique(id,owner_id,administration_id),
 foreign key(administration_id,owner_id) references public.administrations(id,owner_id),
 invoice_id uuid, entry_date date not null, description text not null, status text not null default 'draft' check(status in ('draft','posted')), idempotency_key text not null, reversal_of uuid, unique(administration_id,idempotency_key), foreign key(invoice_id,owner_id,administration_id) references public.invoices(id,owner_id,administration_id), foreign key(reversal_of,owner_id,administration_id) references public.journal_entries(id,owner_id,administration_id)
);
alter table public.journal_entries enable row level security;
revoke all on public.journal_entries from public,anon,authenticated;
grant select on public.journal_entries to authenticated;
create policy owner_read on public.journal_entries for select to authenticated using ((select private.is_owner()) and owner_id=(select auth.uid()));
create index journal_entries_owner_idx on public.journal_entries(owner_id,administration_id);
create table public.journal_lines (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 administration_id uuid not null, created_at timestamptz not null default now(),
 unique(id,owner_id,administration_id),
 foreign key(administration_id,owner_id) references public.administrations(id,owner_id),
 entry_id uuid not null, account_code text not null check(account_code in ('1300','1600','1520','1530','0500','0510','8000','4400','4500','0100','4800')), amount_cents bigint not null check(amount_cents<>0), vat_box text check(vat_box in ('1a','4a','4b','5b')), tax_base_cents bigint, tax_cents bigint, foreign key(entry_id,owner_id,administration_id) references public.journal_entries(id,owner_id,administration_id)
);
alter table public.journal_lines enable row level security;
revoke all on public.journal_lines from public,anon,authenticated;
grant select on public.journal_lines to authenticated;
create policy owner_read on public.journal_lines for select to authenticated using ((select private.is_owner()) and owner_id=(select auth.uid()));
create index journal_lines_owner_idx on public.journal_lines(owner_id,administration_id);
create table public.payments (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 administration_id uuid not null, created_at timestamptz not null default now(),
 unique(id,owner_id,administration_id),
 foreign key(administration_id,owner_id) references public.administrations(id,owner_id),
 invoice_id uuid not null, entry_id uuid not null, paid_on date not null, amount_cents bigint not null check(amount_cents>0), idempotency_key text not null, unique(administration_id,idempotency_key), foreign key(invoice_id,owner_id,administration_id) references public.invoices(id,owner_id,administration_id), foreign key(entry_id,owner_id,administration_id) references public.journal_entries(id,owner_id,administration_id)
);
alter table public.payments enable row level security;
revoke all on public.payments from public,anon,authenticated;
grant select on public.payments to authenticated;
create policy owner_read on public.payments for select to authenticated using ((select private.is_owner()) and owner_id=(select auth.uid()));
create index payments_owner_idx on public.payments(owner_id,administration_id);
create table public.subscriptions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 administration_id uuid not null, created_at timestamptz not null default now(),
 unique(id,owner_id,administration_id),
 foreign key(administration_id,owner_id) references public.administrations(id,owner_id),
 contact_id uuid not null, name text not null, expected_cents bigint check(expected_cents>=0), business_bps integer not null check(business_bps between 0 and 10000), active boolean not null default true, foreign key(contact_id,owner_id,administration_id) references public.contacts(id,owner_id,administration_id)
);
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from public,anon,authenticated;
grant select on public.subscriptions to authenticated;
create policy owner_read on public.subscriptions for select to authenticated using ((select private.is_owner()) and owner_id=(select auth.uid()));
create index subscriptions_owner_idx on public.subscriptions(owner_id,administration_id);
create table public.assets (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 administration_id uuid not null, created_at timestamptz not null default now(),
 unique(id,owner_id,administration_id),
 foreign key(administration_id,owner_id) references public.administrations(id,owner_id),
 invoice_id uuid not null, name text not null, acquired_on date not null, cost_cents bigint not null check(cost_cents>0), residual_cents bigint not null check(residual_cents>=0), useful_months integer not null check(useful_months>0), check(residual_cents<=cost_cents), foreign key(invoice_id,owner_id,administration_id) references public.invoices(id,owner_id,administration_id)
);
alter table public.assets enable row level security;
revoke all on public.assets from public,anon,authenticated;
grant select on public.assets to authenticated;
create policy owner_read on public.assets for select to authenticated using ((select private.is_owner()) and owner_id=(select auth.uid()));
create index assets_owner_idx on public.assets(owner_id,administration_id);
create table public.time_entries (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 administration_id uuid not null, created_at timestamptz not null default now(),
 unique(id,owner_id,administration_id),
 foreign key(administration_id,owner_id) references public.administrations(id,owner_id),
 worked_on date not null, minutes integer not null check(minutes between 1 and 1440), description text not null, billable boolean not null, evidence_status text not null check(evidence_status in ('proven','reconstructed','uncertain')), evidence_reference text
);
alter table public.time_entries enable row level security;
revoke all on public.time_entries from public,anon,authenticated;
grant select on public.time_entries to authenticated;
create policy owner_read on public.time_entries for select to authenticated using ((select private.is_owner()) and owner_id=(select auth.uid()));
create index time_entries_owner_idx on public.time_entries(owner_id,administration_id);
create table public.reserves (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 administration_id uuid not null, created_at timestamptz not null default now(),
 unique(id,owner_id,administration_id),
 foreign key(administration_id,owner_id) references public.administrations(id,owner_id),
 recorded_on date not null, tax_type text not null check(tax_type in ('vat','income')), amount_cents bigint not null check(amount_cents>=0)
);
alter table public.reserves enable row level security;
revoke all on public.reserves from public,anon,authenticated;
grant select on public.reserves to authenticated;
create policy owner_read on public.reserves for select to authenticated using ((select private.is_owner()) and owner_id=(select auth.uid()));
create index reserves_owner_idx on public.reserves(owner_id,administration_id);
create table public.tasks (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 administration_id uuid not null, created_at timestamptz not null default now(),
 unique(id,owner_id,administration_id),
 foreign key(administration_id,owner_id) references public.administrations(id,owner_id),
 title text not null, severity text not null check(severity in ('info','warning','blocking')), resolved_at timestamptz
);
alter table public.tasks enable row level security;
revoke all on public.tasks from public,anon,authenticated;
grant select on public.tasks to authenticated;
create policy owner_read on public.tasks for select to authenticated using ((select private.is_owner()) and owner_id=(select auth.uid()));
create index tasks_owner_idx on public.tasks(owner_id,administration_id);
create table public.jobs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 administration_id uuid not null, created_at timestamptz not null default now(),
 unique(id,owner_id,administration_id),
 foreign key(administration_id,owner_id) references public.administrations(id,owner_id),
 kind text not null, idempotency_key text not null, status text not null check(status in ('pending','running','done','failed','blocked')), attempts integer not null default 0 check(attempts>=0), next_attempt_at timestamptz, error_code text, unique(administration_id,kind,idempotency_key)
);
alter table public.jobs enable row level security;
revoke all on public.jobs from public,anon,authenticated;
grant select on public.jobs to authenticated;
create policy owner_read on public.jobs for select to authenticated using ((select private.is_owner()) and owner_id=(select auth.uid()));
create index jobs_owner_idx on public.jobs(owner_id,administration_id);
create table public.audit_events (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 administration_id uuid not null, created_at timestamptz not null default now(),
 unique(id,owner_id,administration_id),
 foreign key(administration_id,owner_id) references public.administrations(id,owner_id),
 actor_id uuid not null references auth.users(id), action text not null, entity_id uuid not null, detail jsonb not null default '{}'::jsonb
);
alter table public.audit_events enable row level security;
revoke all on public.audit_events from public,anon,authenticated;
grant select on public.audit_events to authenticated;
create policy owner_read on public.audit_events for select to authenticated using ((select private.is_owner()) and owner_id=(select auth.uid()));
create index audit_events_owner_idx on public.audit_events(owner_id,administration_id);

create unique index unique_sale_number on public.invoices(administration_id,number) where kind='sale' and number is not null;
create unique index unique_supplier_number on public.invoices(administration_id,contact_id,number) where kind='purchase' and number is not null;
create function private.immutable_record() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Immutable record: use an explicit correction'; end; $$;
revoke all on function private.immutable_record() from public,anon,authenticated;
create trigger audit_immutable before update or delete on public.audit_events for each row execute function private.immutable_record();
create trigger document_immutable before update or delete on public.documents for each row execute function private.immutable_record();

create function private.protect_posting() returns trigger language plpgsql set search_path='' as $$
declare target_entry uuid; is_posted boolean;
begin
 if TG_TABLE_NAME='journal_lines' then
  if TG_OP='INSERT' then target_entry:=NEW.entry_id; else target_entry:=OLD.entry_id; end if;
  select status='posted' into is_posted from public.journal_entries where id=target_entry for update;
  if is_posted then raise exception 'Posted journal lines are immutable'; end if;
  if TG_OP='UPDATE' and NEW.entry_id<>OLD.entry_id then
   perform 1 from public.journal_entries where id=NEW.entry_id and status='posted' for update;
   if found then raise exception 'Cannot attach lines to a posted journal'; end if;
  end if;
 elsif TG_OP<>'INSERT' and OLD.status='posted' then raise exception 'Posted records are immutable';
 end if;
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end; $$;
revoke all on function private.protect_posting() from public,anon,authenticated;
create trigger protect_journal before update or delete on public.journal_entries for each row execute function private.protect_posting();
create trigger protect_lines before insert or update or delete on public.journal_lines for each row execute function private.protect_posting();
create trigger protect_invoice before update or delete on public.invoices for each row execute function private.protect_posting();

create function private.check_posting() returns trigger language plpgsql set search_path='' as $$
declare entry public.journal_entries; total numeric; count_lines integer;
begin
 select * into entry from public.journal_entries where id=NEW.id;
 if entry.status='posted' then
  select coalesce(sum(amount_cents),0),count(*) into total,count_lines from public.journal_lines where entry_id=entry.id;
  if total<>0 or count_lines<2 then raise exception 'Unbalanced journal'; end if;
  perform 1 from public.periods where administration_id=entry.administration_id and entry.entry_date between starts_on and ends_on and status='open' for share;
  if not found then raise exception 'No open period for posting'; end if;
 end if;
 return null;
end; $$;
revoke all on function private.check_posting() from public,anon,authenticated;
create constraint trigger journal_balanced after insert or update on public.journal_entries deferrable initially deferred for each row execute function private.check_posting();
