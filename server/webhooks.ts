type Receipt={id:string;type:string;occurredAt:string;payload:unknown};
const decode=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
/** Durable inbox.accept must atomically insert a unique event and the pending job. */
export function resendWebhook(deps:{secret:string;now:()=>number;inbox:{accept:(event:Receipt)=>Promise<boolean>}}) {
 return async(request:Request):Promise<Response>=>{
  if(request.method!=='POST')return new Response(null,{status:405});
  if(!deps.secret.startsWith('whsec_'))return new Response(null,{status:503});
  const id=request.headers.get('svix-id'),timestamp=request.headers.get('svix-timestamp'),signature=request.headers.get('svix-signature');
  if(!id||!timestamp||!signature||!/^[0-9]+$/.test(timestamp)||Math.abs(deps.now()/1000-Number(timestamp))>300)return new Response(null,{status:401});
  const raw=await request.text();if(new TextEncoder().encode(raw).length>1024*1024)return new Response(null,{status:413});
  try{
   const key=await crypto.subtle.importKey('raw',decode(deps.secret.slice(6)),{name:'HMAC',hash:'SHA-256'},false,['verify']);
   let valid=false;for(const item of signature.split(' ')){const [version,value]=item.split(',');if(version==='v1'&&value){if(await crypto.subtle.verify('HMAC',key,decode(value),new TextEncoder().encode(`${id}.${timestamp}.${raw}`)))valid=true;}}
   if(!valid)return new Response(null,{status:401});
   const payload=JSON.parse(raw);if(!['email.received','email.sent','email.delivered','email.bounced','email.failed','email.delivery_delayed','email.complained'].includes(payload.type))return new Response(null,{status:204});
   if(typeof payload.created_at!=='string'||!payload.data?.email_id)return new Response(null,{status:400});
   await deps.inbox.accept({id,type:payload.type,occurredAt:payload.created_at,payload});
   return new Response(null,{status:204});
  }catch{return new Response(null,{status:503});}
 };
}
