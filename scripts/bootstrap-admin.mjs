import {loadBackendEnvironment} from '../server/env.js';
import {accountConfiguration} from '../server/account-config.js';
export const ADMIN_EMAIL='eklavypatel23@gmail.com';
// Operator-only executable; never imported by the HTTP backend.
export async function bootstrapAdmin({url,publicKey,serviceKey,appOrigin,apply=false,fetchImpl=fetch}) {
 const config=accountConfiguration({url,publicKey});
 if(!config.configured||!serviceKey?.trim())throw new Error('Configure backend Supabase URL, public key and service-role key.');
 const origin=new URL(appOrigin);if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password)throw new Error('Invalid APP_ORIGIN.');
 async function remote(path,method='GET',body){
  let r;try{r=await fetchImpl(config.url+path,{method,headers:{apikey:serviceKey,...(!serviceKey.startsWith('sb_secret_')?{Authorization:'Bearer '+serviceKey}:{}),'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(10000),...(body?{body:JSON.stringify(body)}:{})});}catch(e){throw new Error('Supabase connection failed ('+(['EAI_AGAIN','ENOTFOUND','ECONNREFUSED'].includes(e.cause?.code)?e.cause.code:'network_or_timeout')+').');}
  let data;try{data=await r.json();}catch{throw new Error('Supabase returned an invalid response.');}
  if(!r.ok)throw new Error('Supabase setup request failed: HTTP '+r.status+'; '+(['PGRST202','PGRST205','42501','over_email_send_rate_limit'].includes(data.code||data.error_code)?data.code||data.error_code:'provider_rejected')+'. Apply the new migration and check service credentials/SMTP.');
  return data;
 }
 let user;
 for(let page=1;page<=1000;page++){
  const result=await remote('/auth/v1/admin/users?page='+page+'&per_page=100');
  if(!Array.isArray(result.users))throw new Error('Invalid Auth user collection.');
  user=result.users.find(u=>u.email?.toLowerCase()===ADMIN_EMAIL);if(user||result.users.length<100)break;
  if(page===1000)throw new Error('User search limit reached; inspect Auth users with a trusted operator.');
 }
 if(!user){
  if(!apply)return {action:'invite',email:ADMIN_EMAIL,passwordChanged:false};
  await remote('/auth/v1/invite?redirect_to='+encodeURIComponent(new URL('/#/reset-password',origin).href),'POST',{email:ADMIN_EMAIL});
  return {action:'invited',message:'Accept the invitation and set a password, then rerun this script to grant the verified user ID.',passwordChanged:false};
 }
 if(!user.email_confirmed_at)return {action:'await_confirmation',userId:user.id,message:'Existing account preserved. The inbox owner must confirm their email; then rerun.',passwordChanged:false};
 if(!/^[0-9a-f-]{36}$/i.test(user.id))throw new Error('Invalid verified user ID.');
 if(!apply)return {action:'grant_admin',userId:user.id,passwordChanged:false};
 return {action:'bootstrap',...(await remote('/rest/v1/rpc/km_bootstrap_admin','POST',{target_user_id:user.id})),passwordChanged:false};
}
if(process.argv[1]&&import.meta.url===new URL(process.argv[1],'file:').href){
 loadBackendEnvironment();
 try{console.log(JSON.stringify(await bootstrapAdmin({url:process.env.SUPABASE_URL,publicKey:process.env.SUPABASE_PUBLISHABLE_KEY,serviceKey:process.env.SUPABASE_SERVICE_ROLE_KEY,appOrigin:process.env.APP_ORIGIN||'http://127.0.0.1:5173',apply:process.argv.includes('--apply')}),null,2));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
