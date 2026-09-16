import { createClient } from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL;
const publishableKey=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const cloudConfigured=Boolean(url&&publishableKey);
export const supabase=cloudConfigured?createClient(url,publishableKey,{auth:{flowType:'pkce',persistSession:true,detectSessionInUrl:true}}):null;
const localOwner={id:'00000000-0000-4000-8000-000000000001',email:'lokale-testgebruiker@voorbeeld.test'};
export async function signIn() {if(!supabase)throw new Error('Deze template draait lokaal. Koppel eerst een eigen Supabase-project voordat je Google-login inschakelt.');const status=await connectionStatus();if(status.includes('staat nog uit'))throw new Error(status);const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin,queryParams:{prompt:'select_account'}}});if(error)throw new Error('Google-login kon niet worden gestart.');}
export async function verifiedIdentity() {if(!supabase)return localOwner;const {data,error}=await supabase.auth.getUser();if(error||!data.user)return null;const user=data.user;if(!user.email_confirmed_at||!user.identities?.some(i=>i.provider==='google'))throw new Error('Meld je aan met een bevestigd Google-account.');const {data:allowed,error:permissionError}=await supabase.rpc('owner_session');if(permissionError||allowed!==true)throw new Error('Dit account is nog niet als eigenaar ingericht. Volg eerst de productie-inrichting in de handleiding.');return user;}

/** Public provider configuration only; does not read or upload accounting data. */
export async function connectionStatus():Promise<string> {
 if(!cloudConfigured)return 'Lokale template actief. Nog geen Supabase-project gekoppeld.';
 const response=await fetch(`${url}/auth/v1/settings`,{headers:{apikey:publishableKey},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('De verbinding met het Supabase-project kon niet worden gecontroleerd.');
 const settings=await response.json();
 return settings.external?.google===true
  ?'Supabase-project bereikbaar. Google-provider staat aan; controleer nog de eigenaarstoegang.'
  :'Supabase-project bereikbaar. Google-login staat nog uit: configureer eerst de Google OAuth-client in Supabase. Je administratie blijft lokaal opgeslagen.';
}
