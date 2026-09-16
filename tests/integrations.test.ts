import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resendWebhook} from '../server/webhooks.ts';
import {commandHandler} from '../server/commands.ts';
import {proposeFields} from '../src/domain/extraction.ts';

test('pdf-veldvoorstel bewaart bron en onzekerheid, totaal komt niet uit subtotal',()=>{
 const p=proposeFields('Subtotal EUR 19.01 VAT EUR 3.99 Total EUR 23.00 Invoice number INV-123 Invoice date 2026-09-09');
 assert.equal(p.fields.net.value,'19.01');assert.equal(p.fields.gross.value,'23.00');assert.equal(p.fields.vat.value,'3.99');assert.equal(p.fields.supplierNumber.value,'INV-123');assert.equal(p.fields.date.value,'2026-09-09');assert.ok(p.warnings.length);assert.ok(p.fields.net.confidence<1);
 assert.equal(Object.keys(proposeFields('scan zonder bedragen').fields).length,0);
});

test('Resend: handtekening op raw body, replay-idempotency en verlopen events',async()=>{
 const rawKey=new TextEncoder().encode('a long secret for isolated testing'),secret='whsec_'+Buffer.from(rawKey).toString('base64'),now=Date.now(),timestamp=String(Math.floor(now/1000)),id='event-test';
 const raw=JSON.stringify({type:'email.received',created_at:new Date(now).toISOString(),data:{email_id:'mail-1'}});
 const key=await crypto.subtle.importKey('raw',rawKey,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${id}.${timestamp}.${raw}`))).toString('base64');
 const received=new Set<string>();const handler=resendWebhook({secret,now:()=>now,inbox:{accept:async e=>{const first=!received.has(e.id);received.add(e.id);return first;}}});
 const headers={'svix-id':id,'svix-timestamp':timestamp,'svix-signature':'v1,'+signature};
 const request=(body=raw,extra={})=>new Request('https://example.test',{method:'POST',headers:{...headers,...extra},body});
 assert.equal((await handler(request())).status,204);assert.equal((await handler(request())).status,204);assert.equal(received.size,1);
 assert.equal((await handler(request(raw+' '))).status,401);
 assert.equal((await handler(request(raw,{'svix-timestamp':'1'}))).status,401);
});

test('servercommands blijven gesloten zonder vrijgave; ongeautoriseerde request raakt repository niet',async()=>{
 let called=false;const deps={enabled:false,authorization:{allowedEmail:'test@example.test',getUser:async()=>null,isLiveOwnerSession:async()=>false},repository:{transact:async()=>{called=true;throw new Error('must not run');}}};
 const request=()=>new Request('https://example.test',{method:'POST',body:'{}'});
 assert.equal((await commandHandler(deps)(request())).status,503);assert.equal((await commandHandler({...deps,enabled:true})(request())).status,401);assert.equal(called,false);
});
