import { zipSync, strToU8 } from 'fflate';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { State, Invoice } from '../domain/accounting.ts';
import {validateState} from '../domain/validate.ts';
import { vatReport } from '../domain/accounting.ts';
import { formatMoney } from '../domain/money.ts';
import { bytesToBase64,base64ToBytes,sha256 } from './local.ts';

const safeText=(value:string)=>value.replace(/[^\x20-\x7e\xa0-\xff€]/g,'-');
export function csv(rows:unknown[][]):string {return '\uFEFF'+rows.map(row=>row.map(value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(';')).join('\r\n');}
export async function invoicePdf(s:State,i:Invoice):Promise<Uint8Array> {
  if(i.pdfBase64)return base64ToBytes(i.pdfBase64);
  const doc=await PDFDocument.create();doc.setCreationDate(new Date(i.date+'T00:00:00Z'));doc.setModificationDate(new Date(i.date+'T00:00:00Z'));doc.setTitle('TESTFACTUUR '+(i.number||'Concept'));doc.setProducer('ZZP Boekhouding template');
  const regular=await doc.embedFont(StandardFonts.Helvetica);const bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const page=doc.addPage([595.28,841.89]);const navy=rgb(.07,.16,.24);let y=745;
  page.drawRectangle({x:0,y:775,width:596,height:67,color:navy});page.drawText('ZZP BOEKHOUDING / TESTADMINISTRATIE',{x:42,y:802,font:bold,size:16,color:rgb(1,1,1)});
  const write=(text:string,size=11,strong=false)=>{page.drawText(safeText(text),{x:42,y,font:strong?bold:regular,size,color:navy});y-=size+10;};
  write('TESTFACTUUR - NIET VERSTUREN',18,true);write(i.number||'Concept');
  for(const text of [s.profile.name,s.profile.legalName,s.profile.address,`KVK: ${s.profile.kvk} | Btw-id: ${s.profile.vatId}`,s.profile.email])write(text);
  y-=15;write('Aan',12,true);const customer=s.relations.find(r=>r.id===i.relationId);for(const text of [customer?.name??'',customer?.address??'',customer?.email??''])write(text);
  y-=15;write(`Factuurdatum: ${i.date} | Prestatiedatum: ${i.serviceDate}`);write(`Vervaldatum: ${i.due}`);y-=15;
  const words=i.description.split(/\s+/);let line='';for(const word of words){if((line+word).length>74){write(line);line='';}line+=word+' ';}if(line)write(line);
  y-=15;write(`Exclusief btw: ${formatMoney(BigInt(i.net))}`);write(`Btw ${i.vatCode==='NL21'?'21%':'0%'}: ${formatMoney(BigInt(i.vat))}`);write(`Totaal EUR: ${formatMoney(BigInt(i.gross))}`,17,true);write(`IBAN: ${s.profile.iban}`);
  page.drawText('Synthetische lokale test. Geen rechtsgeldige productie-uitgifte.',{x:42,y:42,size:10,font:regular,color:navy});
  return doc.save({useObjectStreams:false});
}
export async function snapshotInvoice(s:State,i:Invoice) {const bytes=await invoicePdf(s,i);i.pdfBase64=bytesToBase64(bytes);i.pdfSha256=await sha256(bytes);}
export async function exportPackage(s:State,period:string):Promise<Uint8Array> {
  const report=vatReport(s,period);const files:Record<string,Uint8Array>={};
  files['LEESMIJ.txt']=strToU8('ZZP Boekhouding lokale TESTadministratie. JSON bevat de volledige testadministratie. CSV-grootboek en btw zijn voor '+period+'. Geen productie-export. Geldwaarden in JSON/CSV zijn centen. CSV-formuleprefixen zijn geneutraliseerd.');
  files['administratie.json']=strToU8(JSON.stringify(s,null,2));
  files['grootboek.csv']=strToU8(csv([['Boeking','Datum','Bron','Omschrijving','Rekening','Debet centen','Credit centen'],...report.entries.flatMap(j=>j.lines.map(l=>[j.id,j.date,j.sourceId,j.description,l.account,BigInt(l.amount)>0n?l.amount:'0',BigInt(l.amount)<0n?String(-BigInt(l.amount)):'0']))]));
  files['relaties.csv']=strToU8(csv([['ID','Naam','Adres','Email','Land'],...s.relations.map(r=>[r.id,r.name,r.address,r.email,r.country])]));
  files['facturen.csv']=strToU8(csv([['ID','Soort','Nummer','Datum','Netto centen','Btw centen','Totaal centen','Status'],...s.invoices.map(i=>[i.id,i.kind,i.number,i.date,i.net,i.vat,i.gross,i.status])]));
  files['btw.csv']=strToU8(csv([['Vak','Grondslag centen','Btw centen'],...Object.entries(report.boxes).map(([box,v])=>[box,String(v.base),String(v.tax)])]));
  files['audit.csv']=strToU8(csv([['ID','Tijdstip','Actie','Object','Toelichting'],...s.audit.map(a=>[a.id,a.at,a.action,a.entityId,a.detail])]));
  for(const d of s.documents) files[`documenten/${d.id}.${d.type==='application/pdf'?'pdf':d.type.split('/')[1]}`]=base64ToBytes(d.base64);
  for(const i of s.invoices.filter(i=>i.pdfBase64))files[`facturen/${i.id}.pdf`]=base64ToBytes(i.pdfBase64);
  const manifest=[];for(const [path,bytes] of Object.entries(files))manifest.push({path,sha256:await sha256(bytes),size:bytes.length});
  files['manifest.json']=strToU8(JSON.stringify(manifest,null,2));return zipSync(files,{level:6});
}
async function key(password:string,salt:Uint8Array) {
  if(password.length<12)throw new Error('Gebruik een wachtzin van minstens 12 tekens.');
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt:salt as BufferSource,iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function encryptedBackup(s:State,password:string):Promise<Uint8Array> {
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(password,salt),new TextEncoder().encode(JSON.stringify(s)));
  return strToU8(JSON.stringify({format:'zzp-boekhouding-template-backup-v1',salt:bytesToBase64(salt),iv:bytesToBase64(iv),data:bytesToBase64(new Uint8Array(data))}));
}
export async function restoreBackup(bytes:Uint8Array,password:string):Promise<State> {
  if(bytes.length>100*1024*1024)throw new Error('Back-up is te groot.');
  const envelope=JSON.parse(new TextDecoder().decode(bytes));if(envelope.format!=='zzp-boekhouding-template-backup-v1')throw new Error('Onbekend back-upformaat.');
  let plain:ArrayBuffer;try{plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(envelope.iv) as BufferSource},await key(password,base64ToBytes(envelope.salt)),base64ToBytes(envelope.data) as BufferSource);}catch{throw new Error('Onjuiste wachtzin of beschadigde back-up.');}
  const state=JSON.parse(new TextDecoder().decode(plain));
  validateState(state);
  if(state.schemaVersion!==1||state.mode!=='sandbox'||!Number.isSafeInteger(state.revision))throw new Error('Onbekende administratieversie.');
  for(const field of ['relations','documents','invoices','journals','payments','periods','hours','subscriptions','jobs','audit','reserves'] as const)if(!Array.isArray(state[field]))throw new Error('Onvolledige back-up.');
  for(const d of state.documents)if(await sha256(base64ToBytes(d.base64))!==d.sha256)throw new Error('Documenthash komt niet overeen.');
  for(const i of state.invoices)if(i.pdfBase64&&await sha256(base64ToBytes(i.pdfBase64))!==i.pdfSha256)throw new Error('Factuur-pdf is gewijzigd.');
  for(const j of state.journals)if(j.lines.reduce((a:bigint,l:{amount:string})=>a+BigInt(l.amount),0n)!==0n)throw new Error('Back-up bevat een ongebalanceerde boeking.');
  return state as State;
}
