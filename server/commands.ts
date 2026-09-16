import type {State,DraftInput} from '../src/domain/accounting.ts';
import {createDraft,approveInvoice,recordPayment,updateDraft,discardDraft,reverseInvoice,reclassifyCost} from '../src/domain/accounting.ts';
import {authorizeOwner} from './auth.ts';
export type Command = {kind:'reclassify';id:string;target:'4400'|'4500';date:string;reason:string;key:string;confirmed:boolean}|{kind:'create';input:DraftInput}|{kind:'update';id:string;input:DraftInput}|{kind:'discard';id:string;reason:string}|{kind:'approve';id:string;confirmed:boolean}|{kind:'payment';id:string;date:string;amount:string;key:string;confirmed:boolean}|{kind:'credit';id:string;date:string;reason:string;confirmed:boolean};
export type Repository={
 /** Must lock owner state, reject revision mismatch and commit state+audit atomically. */
 transact<T>(ownerId:string,revision:number,apply:(state:State)=>T):Promise<T>;
};
export function commandHandler(deps:{authorization:Parameters<typeof authorizeOwner>[1];repository:Repository;enabled:boolean}) {
 return async(request:Request):Promise<Response>=>{
  const json=(code:string,status:number)=>Response.json({code},{status,headers:{'Cache-Control':'no-store'}});
  if(request.method!=='POST')return json('METHOD_NOT_ALLOWED',405);
  if(!deps.enabled)return json('BACKEND_NOT_RELEASED',503);
  let user;try{user=await authorizeOwner(request,deps.authorization);}catch{return json('UNAUTHORIZED',401);}
  try{
   const text=await request.text();if(text.length>32000)return json('TOO_LARGE',413);
   const body=JSON.parse(text) as {revision:number;command:Command};if(!Number.isSafeInteger(body.revision)||body.revision<0||!body.command)return json('INVALID_COMMAND',400);
   const result=await deps.repository.transact(user.id,body.revision,s=>{
    const c=body.command;
    switch(c.kind){case 'reclassify':return reclassifyCost(s,c.id,c.target,c.date,c.reason,c.key,c.confirmed===true);case 'create':return createDraft(s,c.input);case 'update':return updateDraft(s,c.id,c.input);case 'discard':return discardDraft(s,c.id,c.reason);case 'approve':return approveInvoice(s,c.id,c.confirmed===true);case 'payment':if(c.confirmed!==true)throw new Error('CONFIRM_REQUIRED');return recordPayment(s,c.id,c.date,c.amount,c.key);case 'credit':if(c.confirmed!==true)throw new Error('CONFIRM_REQUIRED');return reverseInvoice(s,c.id,c.date,c.reason);default:throw new Error('INVALID_COMMAND');}
   });
   return Response.json({result},{headers:{'Cache-Control':'no-store'}});
  }catch{return json('COMMAND_REJECTED',422);}
 };
}
