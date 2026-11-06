import { loadBackendEnvironment } from '../server/env.js';
import { createApp } from '../server/app.js';
import { callHandler } from '../tests/http.js';
import { accountConfiguration } from '../server/account-config.js';

// Real Auth calls, no mock successes and no elevated key. Default checks only
// sign in/read/log out. --signup explicitly requests test confirmation emails.
loadBackendEnvironment();
const config=accountConfiguration({url:process.env.SUPABASE_URL,publicKey:process.env.SUPABASE_PUBLISHABLE_KEY});
const checks=[];const tokens=new Map();const cookies=[];
const credentials=((process.argv.includes('--signup')||process.argv.includes('--single'))?['A']:['A','B']).map(label=>({label,email:process.env['TEST_AUTH_EMAIL_'+label],password:process.env['TEST_AUTH_PASSWORD_'+label]}));
const missing=credentials.flatMap(c=>[...(!c.email?['TEST_AUTH_EMAIL_'+c.label]:[]),...(!c.password?['TEST_AUTH_PASSWORD_'+c.label]:[])]);
if(!config.configured||missing.length){console.log(JSON.stringify({blocked:true,configurationIssue:config.issue,missing:[...config.missing,...missing]}));process.exitCode=1;}
else {
 const app=createApp({supabaseUrl:config.url,supabasePublicKey:config.publicKey,appOrigin:process.env.APP_ORIGIN||'http://127.0.0.1:5173',accountFetchImpl:async(url,options)=>{
  const response=await fetch(url,options);
  if(new URL(url).pathname==='/auth/v1/token'&&response.ok){try{const data=await response.clone().json();tokens.set(JSON.parse(options.body).email.toLowerCase(),data.access_token);}catch{/* Real handler reports invalid responses. */}}
  return response;
 }});
 const call=(path,body,cookie)=>callHandler(app,{path:'/api/account'+path,method:body===undefined?'GET':'POST',body,headers:cookie?{cookie}:{}});
 let blocked=false;const accounts=[];
 try {
  for(const c of credentials){
   if(process.argv.includes('--signup')){
    const r=await call('/signup',{email:c.email,password:c.password});
    checks.push({account:c.label,stage:'signup',status:r.status,code:r.body.error?.code||null,providerCode:r.body.error?.providerCode||null,retryAfterSeconds:r.body.error?.retryAfterSeconds??null,confirmationRequired:r.body.confirmationRequired===true});
    if(r.status!==202){blocked=true;break;}
    continue; // Email confirmation must be performed by the inbox owner before login.
   }
   const r=await call('/login',{email:c.email,password:c.password});
   checks.push({account:c.label,stage:'login',status:r.status,code:r.body.error?.code||null});
   if(r.status!==200){blocked=true;break;}
   const cookie=r.headers['set-cookie']?.split(';')[0];cookies.push(cookie);
   const first=await call('/me',undefined,cookie);const refreshed=await call('/me',undefined,cookie);
   const restored=first.status===200&&Boolean(first.body.user)&&refreshed.body.user?.id===first.body.user.id;
   checks.push({account:c.label,stage:'refresh',restored,code:first.body.error?.code||null});
   if(!restored){blocked=true;break;}
   if(first.body.user.role!=='farmer'){blocked=true;checks.push({account:c.label,stage:'own_requests',skipped:true,reason:'Use ordinary farmer test accounts for isolation checks.'});continue;}
   const requests=await call('/requests',undefined,cookie);
   checks.push({account:c.label,stage:'own_requests',status:requests.status,code:requests.body.error?.code||null});
   if(requests.status!==200){blocked=true;break;}
   accounts.push({id:first.body.user.id,role:first.body.user.role,rows:requests.body.requests||[],email:c.email.toLowerCase()});
  }
  if(!process.argv.includes('--signup')&&accounts.length!==(process.argv.includes('--single')?1:2))blocked=true;
  if(accounts.length===2){
   const[a,b]=accounts;
   if(a.id===b.id||a.role!=='farmer'||b.role!=='farmer'){blocked=true;checks.push({stage:'cross_account_rls',verified:false,reason:'Use two ordinary farmer test accounts; admin access is intentionally broader.'});}
   else if(!b.rows.length){blocked=true;checks.push({stage:'cross_account_rls',verified:false,reason:'Account B needs an existing test access request to prove row isolation.'});}
   else{
    const r=await fetch(config.url+'/rest/v1/km_access_requests?select=id&user_id=eq.'+b.id+'&limit=1',{headers:{apikey:config.publicKey,Authorization:'Bearer '+tokens.get(a.email)},redirect:'error',signal:AbortSignal.timeout(10000)});
    const data=await r.json();const isolated=r.ok&&Array.isArray(data)&&data.length===0;
    checks.push({stage:'cross_account_rls',status:r.status,isolated});if(!isolated)blocked=true;
   }
  }
 }catch{checks.push({stage:'live_check',blocked:true,reason:'Network or response failure; no provider body was printed.'});blocked=true;}
 finally{
  for(const cookie of cookies){const out=await call('/logout',{},cookie);const me=await call('/me',undefined,cookie);const cleared=out.status===200&&me.body.user===null;checks.push({stage:'logout',cleared});if(!cleared)blocked=true;}
  tokens.clear();
 }
 console.log(JSON.stringify({live:true,complete:!blocked&&!process.argv.includes('--signup'),isolation:process.argv.includes('--single')||process.argv.includes('--signup')?'not_tested':'see_checks',signupOnly:process.argv.includes('--signup'),checks},null,2));
 if(blocked)process.exitCode=1;
}
