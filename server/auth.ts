export type VerifiedUser={id:string;email?:string;email_confirmed_at?:string;identities?:{provider:string}[]};
/** Every production command must call this boundary with a live session+allowlist lookup. */
export async function authorizeOwner(request:Request,dependencies:{getUser:(token:string)=>Promise<VerifiedUser|null>;isLiveOwnerSession:(token:string,userId:string)=>Promise<boolean>;allowedEmail:string}):Promise<VerifiedUser> {
  const authorization=request.headers.get('authorization')??'';
  if(!authorization.startsWith('Bearer ')||authorization.length<8)throw new Error('UNAUTHORIZED');
  const token=authorization.slice(7),user=await dependencies.getUser(token);
  if(!user||!user.email_confirmed_at||user.email!==dependencies.allowedEmail||!user.identities?.some(i=>i.provider==='google'))throw new Error('UNAUTHORIZED');
  if(!await dependencies.isLiveOwnerSession(token,user.id))throw new Error('UNAUTHORIZED');return user;
}
