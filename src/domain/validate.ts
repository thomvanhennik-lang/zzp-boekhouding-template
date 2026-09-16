import {accounts} from './accounting.ts';
import type {State} from './accounting.ts';
import {validateDate} from './dates.ts';
/** Backup/import is an untrusted input boundary, including authenticated backups. */
export function validateState(value:unknown):asserts value is State {
 const fail=()=>{throw new Error('De back-up bevat ongeldige of niet-herleidbare administratiegegevens.');};
 if(!value||typeof value!=='object')fail();const s=value as State;
 if(s.schemaVersion!==1||s.mode!=='sandbox'||!Number.isSafeInteger(s.revision)||s.revision<0)fail();
 const keys=['relations','documents','invoices','journals','payments','periods','hours','subscriptions','jobs','audit','reserves'] as const;
 for(const key of keys){if(!Array.isArray(s[key])||s[key].length>100000)fail();const ids=new Set<string>();for(const row of s[key]){if(!row||typeof row.id!=='string'||!row.id||ids.has(row.id))fail();ids.add(row.id);}}
 if(!s.profile||!['name','legalName','address','kvk','vatId','iban','email'].every(k=>typeof (s.profile as unknown as Record<string,unknown>)[k]==='string'))fail();
 if(!s.sequences||typeof s.sequences!=='object'||Object.entries(s.sequences).some(([year,n])=>!/^\d{4}$/.test(year)||!Number.isSafeInteger(n)||n<0))fail();
 const amount=(n:unknown)=>typeof n==='string'&&/^-?\d{1,20}$/.test(n);
 const relationIds=new Set(s.relations.map(r=>r.id)),documentIds=new Set(s.documents.map(d=>d.id)),invoiceIds=new Set(s.invoices.map(i=>i.id)),journalIds=new Set(s.journals.map(j=>j.id));
 for(const r of s.relations)if(!['customer','supplier'].includes(r.kind)||![r.name,r.address,r.email,r.country].every(v=>typeof v==='string')||!Number.isInteger(r.term))fail();
 for(const d of s.documents)if(![d.name,d.type,d.base64,d.sha256,d.uploadedAt].every(v=>typeof v==='string')||!['application/pdf','image/jpeg','image/png','image/heic'].includes(d.type)||!/[a-f0-9]{64}/.test(d.sha256)||d.base64.length>15*1024*1024)fail();
 const saleNumbers=new Set<string>();
 for(const i of s.invoices){
  if(!relationIds.has(i.relationId)||!['sale','purchase'].includes(i.kind)||!['draft','posted'].includes(i.status)||![i.net,i.vat,i.gross].every(amount)||BigInt(i.net)+BigInt(i.vat)!==BigInt(i.gross))fail();
  if(i.costAccount!==undefined&&!['4400','4500'].includes(i.costAccount))fail();
  validateDate(i.date);validateDate(i.serviceDate);validateDate(i.due);
  if(![i.businessBps,i.deductionBps].every(n=>Number.isInteger(n)&&n>=0&&n<=10000)||!['NL21','NONE','EU_SERVICE','NON_EU_SERVICE'].includes(i.vatCode))fail();
  if(i.documentId&&!documentIds.has(i.documentId)||i.creditOf&&!invoiceIds.has(i.creditOf)||i.status==='posted'&&!journalIds.has(i.postingId))fail();
  if(i.kind==='sale'&&i.status==='posted'){if(!/^\d{4}-\d{3,}$/.test(i.number)||saleNumbers.has(i.number))fail();saleNumbers.add(i.number);if((s.sequences[i.number.slice(0,4)]??0)<Number(i.number.slice(5)))fail();}
 }
 const journalKeys=new Set<string>();
 for(const j of s.journals){validateDate(j.date);if(!Array.isArray(j.lines)||j.lines.length<2||!invoiceIds.has(j.sourceId)||journalKeys.has(j.idempotencyKey)||!Array.isArray(j.vat))fail();journalKeys.add(j.idempotencyKey);for(const l of j.lines)if(!(l.account in accounts)||!amount(l.amount))fail();if(j.lines.reduce((a,l)=>a+BigInt(l.amount),0n)!==0n)fail();for(const v of j.vat)if(!['1a','4a','4b','5b'].includes(v.box)||!amount(v.base)||!amount(v.tax))fail();if(j.reversalOf&&!journalIds.has(j.reversalOf))fail();}
 for(const p of s.payments){validateDate(p.date);if(!invoiceIds.has(p.invoiceId)||!journalIds.has(p.postingId)||!amount(p.amount)||BigInt(p.amount)<=0n)fail();}
 for(const i of s.invoices){const sum=s.payments.filter(p=>p.invoiceId===i.id).reduce((a,p)=>a+BigInt(p.amount),0n);if(BigInt(i.gross)>=0n&&sum>BigInt(i.gross))fail();}
 for(const p of s.periods)if(!/^\d{4}-Q[1-4]$/.test(p.id)||!['open','closed'].includes(p.status)||!amount(p.declared)||!Array.isArray(p.checks))fail();
 for(const h of s.hours){validateDate(h.date);if(!Number.isInteger(h.minutes)||h.minutes<1||h.minutes>1440||!['proven','uncertain','reconstructed'].includes(h.evidence))fail();}
 for(const r of s.reserves)if(!amount(r.amount)||BigInt(r.amount)<0n||!['vat','income'].includes(r.type))fail();
 for(const r of s.subscriptions)if(!relationIds.has(r.relationId)||!amount(r.monthly)||BigInt(r.monthly)<0n)fail();
}
