import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import * as accounting from '../src/domain/accounting.ts';
import {validateState} from '../src/domain/validate.ts';
import {ownerStorageKey} from '../src/services/local.ts';
const source=stripTypeScriptTypes(readFileSync(new URL('../src/main.ts',import.meta.url),'utf8').replace(/^import .*\n/gm,''));
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(verify:()=>Promise<unknown>){
 const app={innerHTML:'',addEventListener:()=>{}};const events:Record<string,Function>={};let authEvent:Function=()=>{},loads=0;
 const context:any={console,Error,Intl,URL,URLSearchParams,structuredClone,setTimeout,document:{hidden:false,querySelector:()=>app,addEventListener:(name:string,fn:Function)=>{events[name]=fn;}},window:{addEventListener:(name:string,fn:Function)=>{events[name]=fn;}},location:{hash:'#settings',search:'',origin:'https://example.test'},A:accounting,validateState,quarterForDate:()=> '2026-Q3',cloudConfigured:true,verifiedIdentity:verify,loadState:async()=>{loads++;return accounting.emptyState();},supabase:{auth:{onAuthStateChange:(fn:Function)=>{authEvent=fn;}}}};
 runInNewContext(source,context);return {app,context,events,authEvent:(event:string)=>authEvent(event),loads:()=>loads};
}
test('logged out and hash navigation never load or render administration',async()=>{
 const h=harness(async()=>null);await settle();assert.match(h.app.innerHTML,/Inloggen met Google/);assert.equal(h.loads(),0);
 h.events.hashchange();assert.doesNotMatch(h.app.innerHTML,/class="shell"/);assert.equal(h.loads(),0);
});
test('verified owner opens dashboard; signout hides it immediately',async()=>{
 const h=harness(async()=>({id:'516a2d65-82f3-4e01-ae97-474510c884fe'}));await settle();assert.match(h.app.innerHTML,/class="shell"/);assert.equal(h.loads(),1);
 h.authEvent('SIGNED_OUT');assert.match(h.app.innerHTML,/Inloggen met Google/);assert.doesNotMatch(h.app.innerHTML,/class="shell"/);
});
test('signout during pending identity check cannot reopen dashboard',async()=>{
 let resolve!:(v:unknown)=>void;const h=harness(()=>new Promise(r=>{resolve=r;}));h.authEvent('SIGNED_OUT');resolve({id:'516a2d65-82f3-4e01-ae97-474510c884fe'});await settle();assert.equal(h.loads(),0);assert.doesNotMatch(h.app.innerHTML,/class="shell"/);
});
test('verification error fails closed and is visible',async()=>{
 const h=harness(async()=>{throw new Error('Geen actieve toegang');});await settle();assert.match(h.app.innerHTML,/Geen actieve toegang/);assert.equal(h.loads(),0);
});
test('account storage never reuses unverified legacy demo key',()=>{
 assert.notEqual(ownerStorageKey('516a2d65-82f3-4e01-ae97-474510c884fe'),'active');assert.throws(()=>ownerStorageKey(''));
});
