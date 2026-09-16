import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../src/domain/accounting.ts';
import {demoState} from '../src/services/demo.ts';
import {invoicePdf,encryptedBackup,restoreBackup,exportPackage,csv} from '../src/services/export.ts';
import {unzipSync,strFromU8} from 'fflate';
import {uploadDocument,sha256} from '../src/services/local.ts';
import {PDFDocument} from 'pdf-lib';
import {taxScenario2026,generalCredit2026,labourCredit2026,grossTax2026} from '../src/domain/tax.ts';
import {authorizeOwner} from '../server/auth.ts';

test('historische fixture: Q2 precies 84, niet in Q3; betalingen verplaatsen btw niet',async()=>{
 const s=await demoState();assert.equal(A.vatReport(s,'2026-Q2').due,8400n);assert.equal(A.vatReport(s,'2026-Q3').due,25911n);
 const invoice=s.invoices.find(i=>i.description==='Voorbeeld websiteontwikkeling')!;
 assert.equal(A.outstanding(s,invoice),101250n);
 assert.throws(()=>A.recordPayment(s,invoice.id,'2026-09-09','101251',A.uid()),/overschrijden/);
 A.recordPayment(s,invoice.id,'2026-09-09','101250','payment-retry');A.recordPayment(s,invoice.id,'2026-09-09','101250','payment-retry');
 assert.equal(A.outstanding(s,invoice),0n);assert.equal(A.vatReport(s,'2026-Q3').due,25911n);
 assert.ok(s.journals.every(j=>j.lines.reduce((a,l)=>a+BigInt(l.amount),0n)===0n));
});
test('gesloten kwartaal blokkeert facturen; credit blijft apart en volledig herleidbaar',async()=>{
 const s=await demoState();const template=s.invoices.find(i=>i.status==='draft')!;
 const old=A.createDraft(s,{...template,date:'2026-06-30',description:'Laat ontdekte prestatie'});
 assert.throws(()=>A.approveInvoice(s,old.id,true),/afgesloten/);
 A.approveInvoice(s,template.id,true);const original=JSON.stringify(s.journals.find(j=>j.id===template.postingId));
 const credit=A.reverseInvoice(s,template.id,'2026-09-09','Verkeerde opdracht gefactureerd');
 assert.equal(credit.gross,'-12100');assert.equal(credit.creditOf,template.id);
 assert.equal(JSON.stringify(s.journals.find(j=>j.id===template.postingId)),original);
 assert.throws(()=>A.reverseInvoice(s,template.id,'2026-09-09','Tweede credit'),/al gecrediteerd/);
});
test('broncontrole en duplicaten blokkeren inkoop; AI job boekt niets',async()=>{
 const s=await demoState();const expense=s.invoices.find(i=>i.kind==='purchase')!;
 const duplicate=A.createDraft(s,{...expense});assert.throws(()=>A.approveInvoice(s,duplicate.id,true),/dubbele factuur/);
 const count=s.journals.length;const a=A.enqueue(s,'extract',expense.documentId),b=A.enqueue(s,'extract',expense.documentId);assert.equal(a.id,b.id);assert.equal(s.journals.length,count);assert.equal(a.status,'blocked');
 const missing=A.createDraft(s,{...expense,documentId:'',supplierNumber:'new'});assert.throws(()=>A.approveInvoice(s,missing.id,true),/originele document/);
});
test('verlegging boekt beide btw-zijden en blokkeert landconflicten/gemengd gebruik',async()=>{
 const s=await demoState(),supplier=A.addRelation(s,{name:'EU Test',address:'Dublin',email:'test@example.test',country:'IE',kind:'supplier',term:14});
 const input={...s.invoices.find(i=>i.kind==='purchase')!,relationId:supplier.id,net:'10000',vat:'0',vatCode:'EU_SERVICE' as const,businessBps:10000,supplierNumber:'EU-1'};
 const invoice=A.createDraft(s,input);A.approveInvoice(s,invoice.id,true);const entry=s.journals.find(j=>j.id===invoice.postingId)!;assert.equal(entry.vat.find(v=>v.box==='4b')?.tax,'2100');assert.equal(entry.vat.find(v=>v.box==='5b')?.tax,'2100');
 assert.throws(()=>A.createDraft(s,{...input,businessBps:8500}),/Gemengd/);assert.throws(()=>A.createDraft(s,{...input,vatCode:'NON_EU_SERVICE'}),/Land/);
});
test('pdf is vast na snapshot; back-up herstelt documenten en bedragen, verkeerd wachtwoord faalt',async()=>{
 const s=await demoState();const i=s.invoices.find(i=>i.pdfBase64)!;const bytes=await invoicePdf(s,i);s.profile.address='Nieuw adres';assert.deepEqual(await invoicePdf(s,i),bytes);
 const backup=await encryptedBackup(s,'lange-test-wachtzin');const restored=await restoreBackup(backup,'lange-test-wachtzin');assert.deepEqual(restored,s);
 await assert.rejects(restoreBackup(backup,'verkeerde-wachtzin'),/Onjuiste/);
 const tampered=structuredClone(s);tampered.documents[0].sha256='0'.repeat(64);await assert.rejects(restoreBackup(await encryptedBackup(tampered,'lange-test-wachtzin'),'lange-test-wachtzin'),/Documenthash/);
 const zip=unzipSync(await exportPackage(s,'2026-Q3'));const manifest=JSON.parse(strFromU8(zip['manifest.json']));for(const file of manifest)assert.equal(await sha256(zip[file.path]),file.sha256);
 assert.ok(csv([['=HYPERLINK("evil")']]).includes("'=HYPERLINK"));
});
test('uploadhash detecteert hetzelfde document onder een andere naam',async()=>{
 const s=A.emptyState(),pdf=await PDFDocument.create();pdf.addPage();const bytes=await pdf.save();
 await uploadDocument(s,new File([bytes],'one.pdf',{type:'application/pdf'}));
 await assert.rejects(uploadDocument(s,new File([bytes],'two.pdf',{type:'application/pdf'})),/al toegevoegd/);
 await assert.rejects(uploadDocument(s,new File(['not a pdf'],'bad.pdf',{type:'application/pdf'})),/geldige bestandsheader/);
});
test('urenstatus, dagmaximum en kwartaalchecklist afgedwongen',async()=>{
 const s=await demoState();A.addHours(s,{date:'2026-09-09',minutes:60,description:'Administratie',project:'Test',billable:false,evidence:'proven',reference:'Notitie'});assert.equal(s.hours[0].evidence,'reconstructed');
 assert.throws(()=>A.addHours(s,{...s.hours[0],minutes:1440}),/24 uur/);
 assert.throws(()=>A.closePeriod(s,'2026-Q3','2026-10-01','25900',[]),/concepten/);
});
test('2026 tabellen: grenswaarden, aftrekbeperking, geen urenafhankelijke aftrek',()=>{
 assert.equal(generalCredit2026(2973600n),311500n);assert.equal(generalCredit2026(7842700n),0n);
 assert.equal(labourCredit2026(0n),0n);assert.equal(labourCredit2026(13292100n),0n);
 assert.equal(grossTax2026(3888300n),1390067n);
 assert.equal(taxScenario2026(0n,true).total,0n);
 const row=taxScenario2026(1000000n,false),business=taxScenario2026(1000000n,true);assert.equal(row.zvw,48500n);assert.equal(business.exemption,127000n);assert.equal(business.zvw,42341n);
 assert.equal(taxScenario2026(20000000n,true).limitation,303276n);
});
test('serverauth weigert ander account, verkeerde provider en ingetrokken sessie',async()=>{
 const user={id:'u',email:'owner@example.test',email_confirmed_at:'2026-01-01',identities:[{provider:'google'}]};const request=new Request('https://example.test',{headers:{authorization:'Bearer verified-token'}});
 const deps={allowedEmail:'owner@example.test',getUser:async()=>user,isLiveOwnerSession:async()=>true};assert.equal((await authorizeOwner(request,deps)).id,'u');
 await assert.rejects(authorizeOwner(request,{...deps,allowedEmail:'other@example.test'}),/UNAUTHORIZED/);
 await assert.rejects(authorizeOwner(request,{...deps,getUser:async()=>({...user,identities:[{provider:'email'}]})}),/UNAUTHORIZED/);
 await assert.rejects(authorizeOwner(request,{...deps,isLiveOwnerSession:async()=>false}),/UNAUTHORIZED/);
});

test('concept bewerken/intrekken behoudt audit; bestaande factuurimport houdt nummerreeks heel',async()=>{
 const s=await demoState(),draft=s.invoices.find(i=>i.status==='draft')!;
 A.updateDraft(s,draft.id,{...draft,net:'20000',description:'Aangepaste opdracht'});assert.equal(draft.gross,'24200');
 A.discardDraft(s,draft.id,'Testconcept niet nodig');assert.ok(!s.invoices.some(i=>i.id===draft.id));assert.ok(s.audit.some(a=>a.action==='draft_discarded'&&a.detail.includes('Aangepaste opdracht')));
 const customer=s.relations.find(r=>r.kind==='customer')!;
 const imported=A.importExistingSale(s,{kind:'sale',relationId:customer.id,description:'Bestaande testfactuur',date:'2026-09-05',serviceDate:'2026-09-04',net:'10000',vatCode:'NL21',businessBps:10000,deductionBps:10000,reason:'',supplierNumber:'',documentId:s.documents[0].id},'2026-010',undefined,true);
 assert.equal(imported.number,'2026-010');assert.equal(s.sequences['2026'],10);assert.ok(imported.pdfBase64);
 const next=A.createDraft(s,{...imported,description:'Volgende testfactuur'});A.approveInvoice(s,next.id,true);assert.equal(next.number,'2026-011');
});

test('herstel weigert verweesde facturen en onbekende grootboekrekeningen',async()=>{
 const s=await demoState();s.invoices[0].relationId='missing';await assert.rejects(restoreBackup(await encryptedBackup(s,'lange-test-wachtzin'),'lange-test-wachtzin'),/niet-herleidbare/);
});

test('categoriecorrectie bewaart origineel, btw, betaling en totale kosten; retry is eenmalig',async()=>{
 const s=await demoState(),i=s.invoices.find(i=>i.kind==='purchase')!;
 const original=JSON.stringify(i),vat=A.vatReport(s,'2026-Q3'),payments=JSON.stringify(s.payments),total=A.costBalances(s,i.id)['4400'];
 const first=A.reclassifyCost(s,i.id,'4500','2026-09-09','Andere zakelijke dienst','category-test',true);
 assert.equal(A.costBalances(s,i.id)['4400'],0n);assert.equal(A.costBalances(s,i.id)['4500'],total);
 assert.equal(JSON.stringify(i),original);assert.deepEqual(A.vatReport(s,'2026-Q3').boxes,vat.boxes);assert.equal(A.vatReport(s,'2026-Q3').due,vat.due);assert.equal(JSON.stringify(s.payments),payments);
 const count=s.journals.length;assert.equal(A.reclassifyCost(s,i.id,'4500','2026-09-09','Andere zakelijke dienst','category-test',true).id,first.id);assert.equal(s.journals.length,count);
 assert.throws(()=>A.reclassifyCost(s,i.id,'4400','2026-09-09','Andere zakelijke dienst','category-test',true),/Actiecode/);
 A.reclassifyCost(s,i.id,'4400','2026-09-09','Toch softwarekosten','category-back',true);assert.equal(A.costBalances(s,i.id)['4400'],total);
 const restored=await restoreBackup(await encryptedBackup(s,'een goede test wachtzin'),'een goede test wachtzin');assert.deepEqual(A.costBalances(restored,i.id),A.costBalances(s,i.id));
});
test('categoriecorrectie vereist controle, open perioden en chronologische datum',async()=>{
 const s=await demoState(),i=s.invoices.find(i=>i.kind==='purchase')!,before=JSON.stringify(s);
 assert.throws(()=>A.reclassifyCost(s,i.id,'4500','2026-09-09','Correctie','k',false),/Bevestig/);
 assert.throws(()=>A.reclassifyCost(s,i.id,'4500','2026-07-01','Correctie','k',true),/vóór/);
 assert.throws(()=>A.reclassifyCost(s,i.id,'4400','2026-09-09','Correctie','k',true),/geen kosten/);
 assert.equal(JSON.stringify(s),before);
 s.periods.push({id:'2026-Q3',status:'closed',submittedAt:'2026-10-01',paidAt:'',declared:'0',checks:[]});
 assert.throws(()=>A.reclassifyCost(s,i.id,'4500','2026-10-01','Correctie','k',true),/afgesloten/);
});

test('inkoop kan direct op overige kosten; onbekende categorie wordt geweigerd',async()=>{
 const s=await demoState(),template=s.invoices.find(i=>i.kind==='purchase')!;
 s.invoices=[];s.journals=[];s.payments=[];
 const i=A.createDraft(s,{...template,costAccount:'4500'});A.approveInvoice(s,i.id,true);
 assert.equal(A.costBalances(s,i.id)['4400'],0n);assert.ok(A.costBalances(s,i.id)['4500']>0n);
 const before=JSON.stringify(s);
 assert.throws(()=>A.createDraft(s,{...template,costAccount:'0100' as '4400'}),/kostencategorie/);assert.equal(JSON.stringify(s),before);
});
