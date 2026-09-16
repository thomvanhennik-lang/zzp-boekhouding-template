import { emptyState,addRelation,createDraft,approveInvoice,recordPayment,closePeriod,closingChecks,uid,setReserve } from '../domain/accounting.ts';
import type { State } from '../domain/accounting.ts';
import { PDFDocument } from 'pdf-lib';
import { bytesToBase64,sha256 } from './local.ts';
import { snapshotInvoice } from './export.ts';
export async function demoState():Promise<State> {
  const s=emptyState();s.profile={name:'ZZP Boekhouding · fictieve test',legalName:'Testondernemer',address:'Voorbeeldstraat 1, 1234 AB Teststad',kvk:'00000000',vatId:'NL000000000B00',iban:'NL00TEST0000000000',email:'test@example.test'};
  const customer=addRelation(s,{name:'Voorbeeldklant A',address:'Testlaan 2, Teststad',email:'klant@example.test',country:'NL',kind:'customer',term:14});
  const supplier=addRelation(s,{name:'Voorbeeld Software',address:'Testlaan 3, Teststad',email:'software@example.test',country:'NL',kind:'supplier',term:14});
  const old=createDraft(s,{kind:'sale',relationId:customer.id,description:'Historische testopdracht',date:'2026-06-15',serviceDate:'2026-06-15',net:'40000',vatCode:'NL21',businessBps:10000,deductionBps:10000,reason:'',supplierNumber:'',documentId:''});
  approveInvoice(s,old.id,true);await snapshotInvoice(s,old);recordPayment(s,old.id,'2026-06-29','48400',uid());closePeriod(s,'2026-Q2','2026-07-20','8400',closingChecks);s.periods[0].paidAt='2026-07-20';
  const sale=createDraft(s,{kind:'sale',relationId:customer.id,description:'Voorbeeld websiteontwikkeling',date:'2026-08-12',serviceDate:'2026-08-12',net:'125000',vatCode:'NL21',businessBps:10000,deductionBps:10000,reason:'',supplierNumber:'',documentId:''});approveInvoice(s,sale.id,true);await snapshotInvoice(s,sale);recordPayment(s,sale.id,'2026-08-20','50000',uid());
  createDraft(s,{kind:'sale',relationId:customer.id,description:'Voorbeeld automatiseringsopdracht',date:'2026-09-04',serviceDate:'2026-09-04',net:'10000',vatCode:'NL21',businessBps:10000,deductionBps:10000,reason:'',supplierNumber:'',documentId:''});
  const pdf=await PDFDocument.create();pdf.addPage().drawText('FICTIEVE SOFTWAREFACTUUR\nNetto EUR 19,01 / BTW EUR 3,99 / Totaal EUR 23,00');const bytes=await pdf.save();
  const d={id:uid(),name:'voorbeeld-software.pdf',type:'application/pdf',base64:bytesToBase64(bytes),sha256:await sha256(bytes),uploadedAt:new Date().toISOString(),extraction:'manual' as const,confidence:null};s.documents.push(d);
  const expense=createDraft(s,{kind:'purchase',relationId:supplier.id,description:'Software augustus (fictief)',date:'2026-08-01',serviceDate:'2026-08-01',net:'1901',vat:'399',vatCode:'NL21',businessBps:8500,deductionBps:10000,reason:'85% zakelijk voor test',supplierNumber:'DEMO-08',documentId:d.id});approveInvoice(s,expense.id,true);recordPayment(s,expense.id,'2026-08-01','2300',uid());
  s.subscriptions.push({id:uid(),relationId:supplier.id,name:'Software-abonnement (test)',monthly:'2300',businessBps:8500,active:true});setReserve(s,'vat','20000','2026-09-09');setReserve(s,'income','35000','2026-09-09');return s;
}
