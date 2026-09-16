import { businessAllocation, invoiceTotals, percentage } from './money.ts';
import { dueDate, quarterForDate, validateDate } from './dates.ts';

export const accounts = {
  '1300': 'Te ontvangen van klanten', '1600': 'Te betalen aan leveranciers',
  '1520': 'Te betalen btw', '1530': 'Terug te vragen btw', '0500': 'Privéstortingen',
  '0510': 'Privéonttrekkingen', '8000': 'Omzet diensten', '4400': 'Softwarekosten',
  '4500': 'Overige zakelijke kosten', '0100': 'Bedrijfsmiddelen', '4800': 'Afschrijvingen',
} as const;
export type Account = keyof typeof accounts;
export type VatCode = 'NL21' | 'NONE' | 'EU_SERVICE' | 'NON_EU_SERVICE';
export type Relation = { id:string; name:string; address:string; email:string; country:string; kind:'customer'|'supplier'; term:number };
export type Profile = { name:string; legalName:string; address:string; kvk:string; vatId:string; iban:string; email:string };
export type SourceDocument = { id:string; name:string; type:string; base64:string; sha256:string; uploadedAt:string; extraction:'manual'|'pending'|'review'; confidence:number|null; proposal?:{engine:string;at:string;fields:Record<string,{value:string;confidence:number;source:string}>;warnings:string[]} };
export type Invoice = { id:string; kind:'sale'|'purchase'; relationId:string; description:string; date:string; serviceDate:string; due:string; net:string; vat:string; gross:string; vatCode:VatCode; businessBps:number; deductionBps:number; reason:string; costAccount?:'4400'|'4500'; status:'draft'|'posted'; number:string; supplierNumber:string; documentId:string; reviewed:boolean; postingId:string; creditOf:string; pdfBase64:string; pdfSha256:string };
export type Journal = { id:string; date:string; description:string; sourceId:string; idempotencyKey:string; reversalOf:string; lines:{account:Account; amount:string}[]; vat:{box:'1a'|'4a'|'4b'|'5b'; base:string; tax:string}[] };
export type Period = { id:string; status:'open'|'closed'; submittedAt:string; paidAt:string; declared:string; checks:string[] };
export type Payment = {id:string;invoiceId:string;date:string;amount:string;postingId:string};
export type Audit = {id:string;at:string;action:string;entityId:string;detail:string};
export type Subscription = {id:string;relationId:string;name:string;monthly:string;businessBps:number;active:boolean};
export type Hours = {id:string;date:string;minutes:number;description:string;project:string;billable:boolean;evidence:'proven'|'reconstructed'|'uncertain';reference:string};
export type Job = {id:string;kind:'extract'|'send'|'reminder'|'backup'|'reconcile';entityId:string;status:'pending'|'blocked'|'done'|'failed';reason:string;attempts:number};
export type State = {schemaVersion:1;mode:'sandbox';revision:number;profile:Profile;relations:Relation[];documents:SourceDocument[];invoices:Invoice[];journals:Journal[];payments:Payment[];periods:Period[];hours:Hours[];subscriptions:Subscription[];jobs:Job[];audit:Audit[];reserves:{id:string;type:'vat'|'income';amount:string;date:string}[];sequences:Record<string,number>};
export const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
export function audit(s:State,action:string,entityId:string,detail:string) { s.audit.push({id:uid(),at:now(),action,entityId,detail}); s.revision++; }
export function emptyState():State {
  return {schemaVersion:1,mode:'sandbox',revision:0,profile:{name:'',legalName:'',address:'',kvk:'',vatId:'',iban:'',email:''},relations:[],documents:[],invoices:[],journals:[],payments:[],periods:[],hours:[],subscriptions:[],jobs:[],audit:[],reserves:[],sequences:{}};
}
function requireThat(condition:unknown,message:string):asserts condition { if(!condition) throw new Error(message); }
export function assertOpen(s:State,date:string) { validateDate(date); requireThat(!s.periods.some(p=>p.id===quarterForDate(date)&&p.status==='closed'),'Dit kwartaal is afgesloten. Laat eerst de correctie-impact beoordelen.'); }
export function postJournal(s:State,journal:Omit<Journal,'id'>):Journal {
  const existing=s.journals.find(j=>j.idempotencyKey===journal.idempotencyKey);
  if(existing) {
    requireThat(JSON.stringify({...existing,id:undefined})===JSON.stringify({...journal,id:undefined}),'Deze actiecode is al gebruikt voor een andere boeking.');
    return existing;
  }
  assertOpen(s,journal.date);
  requireThat(journal.lines.length>=2,'Een boeking heeft minstens twee regels nodig.');
  requireThat(journal.lines.every(l=>l.account in accounts && /^-?\d+$/.test(l.amount)),'Ongeldige grootboekregel.');
  requireThat(journal.lines.reduce((sum,l)=>sum+BigInt(l.amount),0n)===0n,'De boeking is niet in balans.');
  requireThat(journal.lines.some(l=>BigInt(l.amount)!==0n),'Een lege boeking is niet toegestaan.');
  const entry={...structuredClone(journal),id:uid()};s.journals.push(entry);audit(s,'posted',entry.id,journal.description);return entry;
}
export function addRelation(s:State,r:Omit<Relation,'id'>) {
  requireThat(r.name.trim()&&r.address.trim()&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email),'Vul naam, adres en een geldig e-mailadres in.');
  requireThat(Number.isInteger(r.term)&&r.term>=0&&r.term<=365,'Ongeldige betalingstermijn.');
  requireThat(r.kind!=='customer'||r.country==='NL','Verkoop ondersteunt alleen Nederlandse klanten.');
  const value={...r,id:uid()};s.relations.push(value);audit(s,'relation_created',value.id,r.name);return value;
}
export function saveProfile(s:State,p:Profile) {
  requireThat(Object.values(p).every(v=>v.trim()),'Vul alle bedrijfsvelden in.');
  requireThat(/^\d{8}$/.test(p.kvk),'KVK-nummer moet acht cijfers hebben.');
  requireThat(/^NL\d{9}B\d{2}$/.test(p.vatId),'Gebruik een Nederlands btw-id.');
  requireThat(/^NL\d{2}[A-Z]{4}\d{10}$/.test(p.iban.replace(/\s/g,'')),'Controleer de Nederlandse IBAN-opmaak.');
  requireThat(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email),'Vul een geldig e-mailadres in.');
  s.profile={...p,iban:p.iban.replace(/\s/g,'')};audit(s,'profile_saved','profile','Bedrijfsgegevens bijgewerkt');
}
export type DraftInput = Pick<Invoice,'kind'|'relationId'|'description'|'date'|'serviceDate'|'net'|'vatCode'|'businessBps'|'deductionBps'|'reason'|'supplierNumber'|'documentId'> & {vat?:string;expectedGross?:string;costAccount?:'4400'|'4500'};
export function createDraft(s:State,input:DraftInput):Invoice {
  requireThat(input.costAccount===undefined||['4400','4500'].includes(input.costAccount),'Kies een geldige kostencategorie.');
  validateDate(input.date);validateDate(input.serviceDate);
  requireThat(input.date>='2026-04-30','Import vóór de startdatum vraagt een aparte aanloopkostencontrole.');
  const relation=s.relations.find(r=>r.id===input.relationId);
  requireThat(relation&&relation.kind===(input.kind==='sale'?'customer':'supplier'),'Kies een passende klant of leverancier.');
  requireThat(input.description.trim().length>2,'Voeg een omschrijving toe.');
  const net=BigInt(input.net); requireThat(net>0n,'Het bedrag moet positief zijn.');
  requireThat(Number.isInteger(input.businessBps)&&Number.isInteger(input.deductionBps),'Ongeldige percentages.');
  requireThat(['NL21','NONE','EU_SERVICE','NON_EU_SERVICE'].includes(input.vatCode),'Onbekende btw-code.');
  requireThat(input.kind!=='sale'||['NL21','NONE'].includes(input.vatCode),'Verkoop ondersteunt deze btw-code niet.');
  requireThat(input.kind!=='purchase'||input.vatCode!=='NL21'||relation.country==='NL','Buitenlandse btw vraagt een afzonderlijke beoordeling.');
  if(input.vatCode==='EU_SERVICE'||input.vatCode==='NON_EU_SERVICE') {
    const eu=['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','PL','PT','RO','SK','SI','ES','SE'];
    requireThat(input.vatCode==='EU_SERVICE'?eu.includes(relation.country):relation.country!=='NL'&&!eu.includes(relation.country),'Land en verleggingscode sluiten niet aan.');
    requireThat(input.businessBps===10000,'Gemengd gebruikte buitenlandse diensten vragen eerst een afzonderlijke fiscale controle.');
  }
  const vat=input.kind==='sale'?invoiceTotals([{net,vatBasisPoints:input.vatCode==='NL21'?2100n:0n}]).vat:BigInt(input.vat??'0');
  requireThat(vat>=0n,'Btw mag niet negatief zijn.');
  if(input.expectedGross!==undefined)requireThat(BigInt(input.expectedGross)===net+vat,'Netto en btw sluiten niet aan op het documenttotaal.');
  requireThat(input.vatCode==='NL21'||vat===0n,'Deze btw-code verwacht geen door de leverancier berekende btw.');
  businessAllocation(net,vat,BigInt(input.businessBps),BigInt(input.deductionBps));
  const invoice:Invoice={...input,net:String(net),vat:String(vat),gross:String(net+vat),id:uid(),due:dueDate(input.date,relation.term),status:'draft',number:'',reviewed:false,postingId:'',creditOf:'',pdfBase64:'',pdfSha256:''};
  s.invoices.push(invoice);audit(s,'draft_created',invoice.id,input.description);return invoice;
}
export function updateDraft(s:State,id:string,input:DraftInput) {
  const old=s.invoices.find(i=>i.id===id);requireThat(old?.status==='draft','Alleen concepten kunnen worden aangepast.');
  const copy=structuredClone(s);const replacement=createDraft(copy,input);
  Object.assign(old,replacement,{id});audit(s,'draft_updated',id,input.description);return old;
}
export function discardDraft(s:State,id:string,reason:string) {
  const invoice=s.invoices.find(i=>i.id===id);requireThat(invoice?.status==='draft','Alleen concepten kunnen worden ingetrokken.');requireThat(reason.trim().length>3,'Geef een reden.');
  // Originals remain retained; audit stores the full discarded draft for recovery.
  audit(s,'draft_discarded',id,JSON.stringify({reason,draft:invoice}));s.invoices=s.invoices.filter(i=>i.id!==id);
}
export function importExistingSale(s:State,input:DraftInput,number:string,paidDate:string|undefined,confirmed:boolean) {
  requireThat(confirmed,'Bevestig de importgegevens.');requireThat(input.kind==='sale','Import ondersteunt hier bestaande verkoopfacturen.');
  requireThat(new RegExp('^'+input.date.slice(0,4)+'-\\d{3,}$').test(number),'Factuurnummer moet YYYY-NNN zijn en bij het jaar horen.');
  requireThat(!s.invoices.some(i=>i.kind==='sale'&&i.number===number),'Dit factuurnummer is al geïmporteerd.');
  const source=s.documents.find(d=>d.id===input.documentId);requireThat(source?.type==='application/pdf','Koppel de bestaande originele factuur-pdf.');
  const year=input.date.slice(0,4),sequence=Number(number.split('-')[1]);requireThat(sequence>0&&Number.isSafeInteger(sequence),'Ongeldig volgnummer.');
  // Work on a copy so a later payment/date validation failure changes nothing.
  const next=structuredClone(s),previousSequence=next.sequences[year]??0;
  next.sequences[year]=sequence-1;const invoice=createDraft(next,input);approveInvoice(next,invoice.id,true);invoice.pdfBase64=source.base64;invoice.pdfSha256=source.sha256;
  next.sequences[year]=Math.max(previousSequence,sequence);
  if(paidDate)recordPayment(next,invoice.id,paidDate,invoice.gross,`import:${invoice.id}`);
  audit(next,'historical_invoice_imported',invoice.id,number);Object.assign(s,next);return invoice;
}
export function approveInvoice(s:State,id:string,confirmed:boolean):Invoice {
  const i=s.invoices.find(i=>i.id===id);requireThat(i,'Factuur bestaat niet.');
  if(i.status==='posted') return i;
  requireThat(confirmed,'Bevestig de gegevens vóór definitief boeken.');assertOpen(s,i.date);
  const net=BigInt(i.net),vat=BigInt(i.vat),gross=BigInt(i.gross);
  let lines:Journal['lines']=[],tax:Journal['vat']=[];
  if(i.kind==='sale') {
    requireThat(Object.values(s.profile).every(Boolean),'Vul eerst alle bedrijfsgegevens in.');
    const year=i.date.slice(0,4);const sequence=(s.sequences[year]??0)+1;
    i.number=`${year}-${String(sequence).padStart(3,'0')}`;s.sequences[year]=sequence;
    lines=[{account:'1300',amount:String(gross)},{account:'8000',amount:String(-net)},{account:'1520',amount:String(-vat)}];
    if(i.vatCode==='NL21') tax=[{box:'1a',base:String(net),tax:String(vat)}];
  } else {
    requireThat(i.documentId&&s.documents.some(d=>d.id===i.documentId),'Voeg het originele document toe.');
    requireThat(i.supplierNumber.trim()&&i.reason.trim(),'Vul leveranciersfactuurnummer en onderbouwing zakelijk gebruik in.');
    requireThat(!s.invoices.some(x=>x.id!==i.id&&x.status==='posted'&&x.kind==='purchase'&&x.relationId===i.relationId&&(x.supplierNumber.toLowerCase()===i.supplierNumber.toLowerCase()||x.documentId===i.documentId)),'Mogelijke dubbele factuur. Controleer het eerdere document.');
    const split=businessAllocation(net,vat,BigInt(i.businessBps),BigInt(i.deductionBps));
    const reverse=i.vatCode==='EU_SERVICE'||i.vatCode==='NON_EU_SERVICE';
    const reverseTax=reverse?percentage(net,2100n):0n;
    const deductibleReverse=reverse?percentage(percentage(reverseTax,BigInt(i.businessBps)),BigInt(i.deductionBps)):0n;
    // Full supplier payable; private share explicit. Reverse charge assumed 21%, reviewed by user.
    lines=[{account:i.costAccount??'4400',amount:String(split.businessCost+reverseTax-deductibleReverse)},{account:'1530',amount:String(split.deductibleVat+deductibleReverse)},{account:'0510',amount:String(split.privatePart)},{account:'1600',amount:String(-gross)}];
    if(reverse) lines.push({account:'1520',amount:String(-reverseTax)});
    tax=[{box:'5b',base:'0',tax:String(split.deductibleVat+deductibleReverse)}];
    if(reverse)tax.push({box:i.vatCode==='EU_SERVICE'?'4b':'4a',base:String(net),tax:String(reverseTax)});
    i.number=i.supplierNumber;
  }
  const j=postJournal(s,{date:i.date,description:i.description,sourceId:i.id,idempotencyKey:`invoice:${i.id}`,reversalOf:'',lines:lines.filter(l=>BigInt(l.amount)!==0n),vat:tax});
  i.status='posted';i.reviewed=true;i.postingId=j.id;audit(s,'invoice_approved',i.id,i.number);return i;
}
export function outstanding(s:State,i:Invoice):bigint {return BigInt(i.gross)-s.payments.filter(p=>p.invoiceId===i.id).reduce((a,p)=>a+BigInt(p.amount),0n);}
export function recordPayment(s:State,invoiceId:string,date:string,amount:string,key:string) {
  const previous=s.payments.find(p=>p.id===key);if(previous){requireThat(previous.invoiceId===invoiceId&&previous.amount===amount&&previous.date===date,'Betalingscode is al gebruikt.');return previous;}
  const i=s.invoices.find(i=>i.id===invoiceId);requireThat(i?.status==='posted','Boek de factuur eerst definitief.');
  const value=BigInt(amount);requireThat(value>0n&&value<=outstanding(s,i),'Betaling moet positief zijn en mag het openstaande bedrag niet overschrijden.');
  const lines:Journal['lines']=i.kind==='sale'?[{account:'0510',amount},{account:'1300',amount:String(-value)}]:[{account:'1600',amount},{account:'0500',amount:String(-value)}];
  const j=postJournal(s,{date,description:`Privé ${i.kind==='sale'?'ontvangen':'betaald'} · ${i.number}`,sourceId:i.id,idempotencyKey:`payment:${key}`,reversalOf:'',lines,vat:[]});
  const payment={id:key,invoiceId,date,amount,postingId:j.id};s.payments.push(payment);audit(s,'payment_recorded',i.id,amount);return payment;
}
export function reverseInvoice(s:State,id:string,date:string,reason:string) {
  const i=s.invoices.find(i=>i.id===id);requireThat(i?.status==='posted'&&i.kind==='sale'&&!i.creditOf,'Selecteer een definitieve verkoopfactuur.');
  requireThat(!s.invoices.some(x=>x.creditOf===id),'Deze factuur is al gecrediteerd.');
  requireThat(!s.payments.some(p=>p.invoiceId===id),'Bij een betaalde factuur moet eerst een gecontroleerde terugbetalingsflow worden uitgewerkt.');
  assertOpen(s,i.date);assertOpen(s,date);requireThat(reason.trim().length>=5,'Geef een concrete correctiereden.');
  const original=s.journals.find(j=>j.id===i.postingId)!;
  const year=date.slice(0,4);const sequence=(s.sequences[year]??0)+1;
  const credit={...i,id:uid(),date,serviceDate:i.serviceDate,due:date,description:`Credit: ${reason}`,net:String(-BigInt(i.net)),vat:String(-BigInt(i.vat)),gross:String(-BigInt(i.gross)),number:`${year}-${String(sequence).padStart(3,'0')}`,creditOf:id,pdfBase64:'',pdfSha256:''};
  const j=postJournal(s,{...original,date,sourceId:credit.id,description:credit.description,idempotencyKey:`credit:${id}`,reversalOf:original.id,lines:original.lines.map(l=>({...l,amount:String(-BigInt(l.amount))})),vat:original.vat.map(v=>({...v,base:String(-BigInt(v.base)),tax:String(-BigInt(v.tax))}))});
  credit.postingId=j.id;s.sequences[year]=sequence;s.invoices.push(credit);audit(s,'credited',id,reason);return credit;
}
export function accountTotal(s:State,account:Account,period?:string):bigint {return s.journals.filter(j=>!period||quarterForDate(j.date)===period||j.date.startsWith(period)&&period.length===4).reduce((a,j)=>a+j.lines.filter(l=>l.account===account).reduce((b,l)=>b+BigInt(l.amount),0n),0n);}
export function vatReport(s:State,period:string) {
  const boxes={'1a':{base:0n,tax:0n},'4a':{base:0n,tax:0n},'4b':{base:0n,tax:0n},'5b':{base:0n,tax:0n}};
  const entries=s.journals.filter(j=>quarterForDate(j.date)===period);
  for(const j of entries)for(const v of j.vat){boxes[v.box].base+=BigInt(v.base);boxes[v.box].tax+=BigInt(v.tax);}
  const floor=(n:bigint)=>n>=0n?n/100n:-((-n+99n)/100n);
  const ceil=(n:bigint)=>-floor(-n);
  const roundedDue=(floor(boxes['1a'].tax)+floor(boxes['4a'].tax)+floor(boxes['4b'].tax)-ceil(boxes['5b'].tax))*100n;
  return {boxes,entries,due:boxes['1a'].tax+boxes['4a'].tax+boxes['4b'].tax-boxes['5b'].tax,roundedDue};
}
export const closingChecks=['Verwachte abonnementen compleet','Facturen en duplicaten gecontroleerd','Betalingen gecontroleerd','Buitenlandse btw gecontroleerd','Reserve bijgewerkt','Kwartaalexport gecontroleerd'];
export function closePeriod(s:State,period:string,submittedAt:string,declared:string,checks:string[]) {
  requireThat(/^\d{4}-Q[1-4]$/.test(period),'Ongeldig kwartaal.');validateDate(submittedAt);
  requireThat(!s.periods.some(p=>p.id===period&&p.status==='closed'),'Kwartaal is al afgesloten.');
  requireThat(!s.invoices.some(i=>i.status==='draft'&&quarterForDate(i.date)===period),'Werk eerst alle concepten in dit kwartaal af.');
  requireThat(closingChecks.every(c=>checks.includes(c)),'Rond alle kwartaalcontroles af.');
  const report=vatReport(s,period);requireThat(BigInt(declared)===report.roundedDue,'Aangegeven bedrag wijkt af van de afronding per vak. Corrigeer of laat de afwijking beoordelen.');
  s.periods=s.periods.filter(p=>p.id!==period);s.periods.push({id:period,status:'closed',submittedAt,paidAt:'',declared,checks});audit(s,'period_closed',period,declared);
}
export function addHours(s:State,h:Omit<Hours,'id'>) {validateDate(h.date);requireThat(Number.isInteger(h.minutes)&&h.minutes>0&&h.minutes<=1440,'Duur moet tussen 1 en 1440 minuten liggen.');requireThat(h.description.trim(),'Omschrijf de activiteit.');requireThat(h.evidence!=='proven'||h.reference.trim(),'Voeg een bewijsverwijzing toe.');requireThat(s.hours.filter(x=>x.date===h.date).reduce((a,x)=>a+x.minutes,0)+h.minutes<=1440,'Meer dan 24 uur op één dag is niet mogelijk.');const entry={...h,id:uid(),evidence:h.date<'2027-01-01'?'reconstructed' as const:h.evidence};s.hours.push(entry);audit(s,'hours_added',entry.id,h.description);}
export function setReserve(s:State,type:'vat'|'income',amount:string,date:string) {validateDate(date);requireThat(BigInt(amount)>=0n,'Reserve mag niet negatief zijn.');s.reserves.push({id:uid(),type,amount,date});audit(s,'reserve_updated',type,amount);}
export function reserve(s:State,type:'vat'|'income') {return BigInt(s.reserves.filter(r=>r.type===type).at(-1)?.amount??'0');}
export function enqueue(s:State,kind:Job['kind'],entityId:string) {const existing=s.jobs.find(j=>j.kind===kind&&j.entityId===entityId&&j.status!=='failed');if(existing)return existing;const job:Job={id:uid(),kind,entityId,status:'blocked',attempts:0,reason:kind==='extract'?'OCR-provider niet aangesloten. Voer velden handmatig in.':kind==='send'||kind==='reminder'?'Externe verzending uitgeschakeld in de testomgeving.':'Online koppeling nog niet aangesloten.'};s.jobs.push(job);audit(s,'job_created',job.id,kind);return job;}
export function alerts(s:State,date:string) {
  return [
    ...s.invoices.filter(i=>i.status==='draft').map(i=>({title:`Controleer concept: ${i.description}`,target:'invoices',priority:2})),
    ...s.invoices.filter(i=>i.kind==='sale'&&i.status==='posted'&&!i.creditOf&&!s.invoices.some(c=>c.creditOf===i.id)&&i.due<date&&outstanding(s,i)>0n).map(i=>({title:`Factuur ${i.number} is over de betaaldatum`,target:'invoices',priority:1})),
    ...s.subscriptions.filter(a=>a.active&&!s.invoices.some(i=>i.kind==='purchase'&&i.relationId===a.relationId&&i.date.slice(0,7)===date.slice(0,7))).map(a=>({title:`Maandfactuur ontbreekt: ${a.name}`,target:'expenses',priority:2})),
    ...s.jobs.filter(j=>j.status==='failed'||j.status==='blocked').map(j=>({title:j.reason,target:'settings',priority:3})),
  ].sort((a,b)=>a.priority-b.priority);
}

/** Derive classification from the immutable source entry and subsequent transfers. */
export function costBalances(s:State,invoiceId:string) {
 const balances={'4400':0n,'4500':0n};
 for(const j of s.journals.filter(j=>j.sourceId===invoiceId))for(const line of j.lines)
  if(line.account==='4400'||line.account==='4500')balances[line.account]+=BigInt(line.amount);
 return balances;
}
export function reclassifyCost(s:State,id:string,target:'4400'|'4500',date:string,reason:string,key:string,confirmed:boolean) {
 requireThat(confirmed,'Bevestig de categoriecorrectie.');
 requireThat(['4400','4500'].includes(target),'Kies een geldige kostencategorie.');
 requireThat(reason.trim().length>=4,'Geef een duidelijke reden voor de correctie.');
 requireThat(key.trim().length>0,'Actiecode ontbreekt.');
 const invoice=s.invoices.find(i=>i.id===id);
 requireThat(invoice?.kind==='purchase'&&invoice.status==='posted','Kies een definitief geboekte inkoop.');
 const description=`Categoriecorrectie naar ${target} · ${reason.trim()}`;
 const prior=s.journals.find(j=>j.idempotencyKey===`category:${key}`);
 if(prior){requireThat(prior.sourceId===id&&prior.date===date&&prior.description===description,'Actiecode is al gebruikt voor een andere correctie.');return prior;}
 assertOpen(s,invoice.date);assertOpen(s,date);
 requireThat(date>=invoice.date,'Correctiedatum mag niet vóór de factuurdatum liggen.');
 const balances=costBalances(s,id),from=target==='4400'?'4500':'4400',amount=balances[from];
 requireThat(amount>0n,'Er zijn geen kosten naar deze categorie te verplaatsen.');
 const journal=postJournal(s,{date,description,sourceId:id,idempotencyKey:`category:${key}`,reversalOf:'',lines:[{account:from,amount:String(-amount)},{account:target,amount:String(amount)}],vat:[]});
 audit(s,'cost_reclassified',id,JSON.stringify({from,target,amount:String(amount),reason,date,journalId:journal.id}));
 return journal;
}
