import type { State, SourceDocument } from '../domain/accounting.ts';
import { emptyState, uid, audit } from '../domain/accounting.ts';

export function bytesToBase64(bytes:Uint8Array):string {let text='';for(let start=0;start<bytes.length;start+=8192)text+=String.fromCharCode(...bytes.subarray(start,start+8192));return btoa(text);}
export function base64ToBytes(value:string):Uint8Array{return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
export async function sha256(bytes:Uint8Array):Promise<string> {return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource)),x=>x.toString(16).padStart(2,'0')).join('');}
export function ownerStorageKey(ownerId:string):string {if(!/^[0-9a-f-]{36}$/i.test(ownerId))throw new Error('Geen geldig ingelogd account.');return `owner:${ownerId}:v1`;}
const database = () => new Promise<IDBDatabase>((resolve,reject)=>{const req=indexedDB.open('zzp-boekhouding-template-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('state');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error('Lokale opslag kan niet worden geopend.'));});
export async function loadState(ownerId:string):Promise<State> {const db=await database();return new Promise((resolve,reject)=>{const req=db.transaction('state').objectStore('state').get(ownerStorageKey(ownerId));req.onsuccess=()=>{db.close();resolve(req.result??emptyState());};req.onerror=()=>{db.close();reject(new Error('De testadministratie kan niet worden gelezen.'));};});}
export async function persistState(state:State,expectedRevision:number,ownerId:string):Promise<void> {
  const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');const store=tx.objectStore('state');const get=store.get(ownerStorageKey(ownerId));get.onsuccess=()=>{if(get.result&&get.result.revision!==expectedRevision){tx.abort();return;}store.put(state,ownerStorageKey(ownerId));};tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(new Error('Gegevens zijn in een ander venster gewijzigd. Herlaad de pagina.'));};tx.onerror=()=>{db.close();reject(new Error('Opslaan mislukt. De wijziging is niet bewaard.'));};});
}
export async function uploadDocument(s:State,file:File):Promise<SourceDocument> {
  if(file.size>10*1024*1024||file.size===0)throw new Error('Bestand moet tussen 1 byte en 10 MB zijn.');
  const bytes=new Uint8Array(await file.arrayBuffer());const header=new TextDecoder().decode(bytes.slice(0,16));
  let type='';if(header.startsWith('%PDF-'))type='application/pdf';else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)type='image/jpeg';else if(bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10')type='image/png';else if(header.slice(4,8)==='ftyp'&&/heic|heix|mif1/.test(header))type='image/heic';
  if(!type)throw new Error('Upload een PDF, JPEG, PNG of HEIC met een geldige bestandsheader.');
  if(type==='application/pdf'&&!new TextDecoder().decode(bytes.slice(-1024)).includes('%%EOF'))throw new Error('Dit pdf-bestand lijkt onvolledig.');
  const hash=await sha256(bytes);if(s.documents.some(d=>d.sha256===hash))throw new Error('Dit document is al toegevoegd, mogelijk onder een andere naam.');
  const doc:SourceDocument={id:uid(),name:file.name,type,base64:bytesToBase64(bytes),sha256:hash,uploadedAt:new Date().toISOString(),extraction:'manual',confidence:null};s.documents.push(doc);audit(s,'document_uploaded',doc.id,hash);return doc;
}
export function download(bytes:Uint8Array,name:string,type='application/octet-stream') {const blob=new Blob([bytes as BlobPart],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
