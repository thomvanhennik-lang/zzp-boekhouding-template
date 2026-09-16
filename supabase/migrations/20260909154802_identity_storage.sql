-- Owner email must be provisioned by operator; no identity automatically enrolled.
create table private.auth_policy (
 singleton boolean primary key default true check(singleton),
 allowed_email text not null
);
alter table private.auth_policy enable row level security;
revoke all on private.auth_policy from public,anon,authenticated;
create or replace function private.is_owner() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists (
  select 1 from private.owner_access a
  join auth.users u on u.id=a.user_id
  join private.auth_policy p on p.singleton
  where a.enabled and a.user_id=auth.uid() and u.email=p.allowed_email
   and u.email_confirmed_at is not null
   and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')
   and exists(select 1 from auth.sessions s where s.user_id=u.id and s.id::text=auth.jwt()->>'session_id')
 );
$$;
revoke all on function private.is_owner() from public,anon;
grant execute on function private.is_owner() to authenticated;
create function public.owner_session() returns boolean language sql stable security invoker set search_path='' as $$ select private.is_owner(); $$;
revoke all on function public.owner_session() from public,anon;
grant execute on function public.owner_session() to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('accounting-originals','accounting-originals',false,10485760,array['application/pdf','image/jpeg','image/png','image/heic']);
create policy owner_document_read on storage.objects for select to authenticated
 using (bucket_id='accounting-originals' and (select private.is_owner()) and (storage.foldername(name))[1]=(select auth.uid())::text);
-- No update/delete policy: original objects cannot be replaced by the owner client.
-- Uploads via authenticated client must stay in the owner's prefix.
create policy owner_document_insert on storage.objects for insert to authenticated
 with check (bucket_id='accounting-originals' and (select private.is_owner()) and (storage.foldername(name))[1]=(select auth.uid())::text);
