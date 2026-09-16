import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';

export async function freshDatabase() {
  const db = new PGlite();
  // Minimal Supabase contracts. This does not simulate Google or Storage APIs.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create table auth.identities (user_id uuid references auth.users(id), provider text);
    create table auth.sessions (id uuid primary key, user_id uuid references auth.users(id));
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text unique);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated;
    grant select,insert,update,delete on storage.objects to anon,authenticated;
    create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  const files = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort();
  assert.ok(files.length > 0);
  for (const file of files) {
    await db.exec('begin');
    try {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
      await db.exec('commit');
    } catch (error) { await db.exec('rollback'); await db.close(); throw error; }
  }
  return db;
}

export async function seed(db: PGlite) {
  await db.query('insert into auth.users values ($1,$3,now()),($2,$4,now())', [owner, other,'owner@example.test','other@example.test']);
  await db.query("insert into private.auth_policy(allowed_email) values ('owner@example.test')");
  await db.query("insert into auth.identities values ($1,'google'),($2,'google')",[owner,other]);
  await db.query('insert into auth.sessions values ($1,$1),($2,$2)',[owner,other]);
  await db.query('insert into private.owner_access (user_id,enabled) values ($1,true)', [owner]);
  await db.query('insert into public.administrations (owner_id,display_name) values ($1,$2)', [owner, 'Testadministratie']);
}

export async function asUser(db: PGlite, user: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({session_id:user})]);
  await db.exec('set role authenticated');
}

test('migraties bouwen een lege database, ook opnieuw in een verse omgeving', async () => {
  for (let iteration = 0; iteration < 2; iteration++) {
    const db = await freshDatabase();
    try {
      const { rows } = await db.query<{ name: string; rls: boolean }>(`select relname as name, relrowsecurity as rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and relkind='r'`);
      assert.equal(rows.length, 19);
      assert.ok(rows.every(row => row.rls));
      assert.equal((await db.query('select * from private.owner_access')).rows.length, 0);
    } finally { await db.close(); }
  }
});

test('RLS: alleen vooraf toegewezen eigenaar leest; tweede account en metadata-spoof niet', async () => {
  const db = await freshDatabase();
  try {
    await seed(db);
    await asUser(db, owner);
    assert.equal((await db.query('select * from public.administrations')).rows.length, 1);
    await asUser(db, other);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({user_metadata: { email: 'owner@example.test', role: 'owner' }})]);
    assert.equal((await db.query('select * from public.administrations')).rows.length, 0);
    await assert.rejects(db.query('select * from private.owner_access'), /permission denied/);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from public.administrations'), /permission denied/);
  } finally { await db.close(); }
});

test('ook eigenaar kan nog niets schrijven of fiscale regels goedkeuren', async () => {
  const db = await freshDatabase();
  try {
    await seed(db);
    await asUser(db, owner);
    await assert.rejects(db.query("update public.administrations set display_name='changed'"), /permission denied/);
    await assert.rejects(db.query('delete from public.administrations'), /permission denied/);
    await assert.rejects(db.query("update public.fiscal_sources set review_status='approved'"), /permission denied/);
    await assert.rejects(db.query('update private.owner_access set enabled=true'), /permission denied/);
    await db.exec('reset role; update private.owner_access set enabled=false');
    await asUser(db, owner);
    assert.equal((await db.query('select * from public.administrations')).rows.length, 0);
  } finally { await db.close(); }
});

test('bronnen vereisen jaargrenzen, unieke versies en bewijs vóór goedkeuring', async () => {
  const db = await freshDatabase();
  try {
    await seed(db);
    const insert = `insert into public.fiscal_sources (owner_id,rule_key,tax_year,version,source_url,effective_from,effective_until) values ($1,'test-rule',2026,1,'https://example.test/source','2026-01-01','2026-12-31')`;
    await db.query(insert, [owner]);
    await assert.rejects(db.query(insert, [owner]), /unique constraint/);
    await assert.rejects(db.query("update public.fiscal_sources set review_status='approved'"), /check constraint/);
    await assert.rejects(db.query("update public.fiscal_sources set effective_until='2027-01-01'"), /check constraint/);
    await asUser(db, other);
    assert.equal((await db.query('select * from public.fiscal_sources')).rows.length, 0);
  } finally { await db.close(); }
});

test('private Storage-policies blokkeren tweede account, overschrijven en intrekking',async()=>{
 const db=await freshDatabase();try{
  await seed(db);await asUser(db,owner);
  await db.query("insert into storage.objects(bucket_id,name) values('accounting-originals',$1)",[owner+'/original.pdf']);
  assert.equal((await db.query('select * from storage.objects')).rows.length,1);
  await db.query("update storage.objects set name='replaced' where true");
  assert.equal((await db.query<{name:string}>('select name from storage.objects')).rows[0].name,owner+'/original.pdf');
  await asUser(db,other);assert.equal((await db.query('select * from storage.objects')).rows.length,0);
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('accounting-originals',$1)",[owner+'/stolen.pdf']),/row-level security/);
  await db.exec('reset role');await db.query('delete from auth.sessions where user_id=$1',[owner]);await asUser(db,owner);
  assert.equal((await db.query('select * from public.administrations')).rows.length,0);assert.equal((await db.query('select * from storage.objects')).rows.length,0);
 }finally{await db.close();}
});

test('SQL posting: onbalans geweigerd, geboekte regels immutable en gesloten periode geblokkeerd',async()=>{
 const db=await freshDatabase();try{
  await seed(db);const admin=(await db.query<{id:string}>('select id from public.administrations')).rows[0].id;
  await db.query("insert into public.periods(owner_id,administration_id,period,starts_on,ends_on) values($1,$2,'2026-Q3','2026-07-01','2026-09-30')",[owner,admin]);
  const create=async(key:string,credit:string)=>{
   await db.exec('begin');
   try{
    const entry=(await db.query<{id:string}>("insert into public.journal_entries(owner_id,administration_id,entry_date,description,idempotency_key) values($1,$2,'2026-09-09','Test',$3) returning id",[owner,admin,key])).rows[0].id;
    await db.query("insert into public.journal_lines(owner_id,administration_id,entry_id,account_code,amount_cents) values($1,$2,$3,'1300',12100),($1,$2,$3,'8000',$4)",[owner,admin,entry,credit]);
    await db.query("update public.journal_entries set status='posted' where id=$1",[entry]);await db.exec('commit');return entry;
   }catch(e){await db.exec('rollback');throw e;}
  };
  await assert.rejects(create('unbalanced','-12099'),/Unbalanced/);
  const entry=await create('balanced','-12100');
  await assert.rejects(db.query('update public.journal_lines set amount_cents=1 where entry_id=$1',[entry]),/immutable/);
  await assert.rejects(db.query('delete from public.journal_entries where id=$1',[entry]),/immutable/);
  await db.exec("update public.periods set status='closed'");await assert.rejects(create('closed','-12100'),/open period/);
  await db.query("insert into public.audit_events(owner_id,administration_id,actor_id,action,entity_id) values($1,$2,$1,'test',$3)",[owner,admin,entry]);
  await assert.rejects(db.query('delete from public.audit_events'),/Immutable/);
  await assert.rejects(db.query("insert into public.contacts(owner_id,administration_id,name,address,email,country,kind) values($1,$2,'Other','Street','test@example.test','NL','customer')",[other,admin]),/foreign key/);
 }finally{await db.close();}
});

async function saleFixture(db:PGlite) {
 await seed(db);await asUser(db,owner);await db.exec('reset role');
 const admin=(await db.query<{id:string}>('select id from public.administrations')).rows[0].id;
 const contact=(await db.query<{id:string}>("insert into public.contacts(owner_id,administration_id,name,address,email,country,kind) values($1,$2,'Testklant','Testadres','test@example.test','NL','customer') returning id",[owner,admin])).rows[0].id;
 await db.query("insert into public.periods(owner_id,administration_id,period,starts_on,ends_on) values($1,$2,'2026-Q3','2026-07-01','2026-09-30')",[owner,admin]);
 const create=async()=>{const id=(await db.query<{id:string}>("insert into public.invoices(owner_id,administration_id,contact_id,kind,invoice_date,service_date,due_date,net_cents,vat_cents,gross_cents,vat_code) values($1,$2,$3,'sale','2026-09-09','2026-09-09','2026-09-23',10000,2100,12100,'NL21') returning id",[owner,admin,contact])).rows[0].id;
 await db.query("insert into public.invoice_lines(owner_id,administration_id,invoice_id,description,net_cents,vat_cents) values($1,$2,$3,'Testdienst',10000,2100)",[owner,admin,id]);return id;};
 return {admin,create};
}
test('SQL verkoop: nummer, journaal en audit atomair; herhaling eenmalig; regels immutable',async()=>{
 const db=await freshDatabase();try{
 const {create}=await saleFixture(db),id=await create();
 const call=()=>db.query<{result:{number:string}}>('select private.post_sale($1,1,true) result',[id]);
 assert.equal((await call()).rows[0].result.number,'2026-001');assert.equal((await call()).rows[0].result.number,'2026-001');
 assert.equal((await db.query('select * from public.audit_events')).rows.length,1);
 assert.equal((await db.query('select * from public.journal_entries')).rows.length,1);
 await assert.rejects(db.query('update public.invoice_lines set net_cents=1 where invoice_id=$1',[id]),/immutable/);
 const second=await create();assert.equal((await db.query<{result:{number:string}}>('select private.post_sale($1,1,true) result',[second])).rows[0].result.number,'2026-002');
 await asUser(db,owner);await assert.rejects(call(),/permission denied/);
 await db.exec('reset role');await asUser(db,other);await db.exec('reset role');await assert.rejects(call(),/UNAUTHORIZED/);
 }finally{await db.close();}
});
test('SQL verkoop: gewijzigde regels vragen nieuwe goedkeuring; late fout laat geen half resultaat achter',async()=>{
 const db=await freshDatabase();try{
 const {create}=await saleFixture(db),id=await create();
 await db.query("update public.invoice_lines set description='Nieuwe omschrijving' where invoice_id=$1",[id]);
 await assert.rejects(db.query('select private.post_sale($1,1,true)',[id]),/REVISION_CONFLICT/);
 await assert.rejects(db.query('select private.post_sale($1,2,false)',[id]),/CONFIRM_REQUIRED/);
 await db.exec("create function private.test_fail_audit() returns trigger language plpgsql as $$begin raise exception 'INJECTED_FAILURE'; end$$; create trigger test_fail before insert on public.audit_events for each row execute function private.test_fail_audit();");
 await assert.rejects(db.query('select private.post_sale($1,2,true)',[id]),/INJECTED_FAILURE/);
 assert.equal((await db.query('select * from public.journal_entries')).rows.length,0);
 assert.equal((await db.query<{status:string;number:string|null}>('select status,number from public.invoices where id=$1',[id])).rows[0].number,null);
 await db.exec('drop trigger test_fail on public.audit_events');
 assert.equal((await db.query<{result:{number:string}}>('select private.post_sale($1,2,true) result',[id])).rows[0].result.number,'2026-001');
 }finally{await db.close();}
});
