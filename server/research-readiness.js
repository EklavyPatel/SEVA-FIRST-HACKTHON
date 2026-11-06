import {accountConfiguration} from './account-config.js';
export function researchConfiguration({url='',publicKey='',serviceKey=''}={}) {
 const account=accountConfiguration({url,publicKey});
 const missing=[...account.missing];
 if(typeof serviceKey!=='string'||!serviceKey.trim())missing.push('SUPABASE_SERVICE_ROLE_KEY');
 let issue=account.issue;
 if(!missing.includes('SUPABASE_SERVICE_ROLE_KEY')){
  let elevated=serviceKey.trim().startsWith('sb_secret_');
  if(!elevated){try{elevated=JSON.parse(Buffer.from(serviceKey.trim().split('.')[1],'base64url')).role==='service_role';}catch{}}
  if(!elevated)issue='invalid_server_key';
 }
 if(!issue&&missing.length)issue='missing_variables';
 return {configured:!issue,issue,missing};
}

export function createResearchReadiness({configuration,store,cacheMs=30_000}={}) {
 let cached,pending,until=0;
 return async()=>{
  if(!configuration.configured)return {ready:false,configuration,checks:{},reason:'configuration_missing'};
  if(cached&&Date.now()<until)return cached;
  if(pending)return pending;
  pending=(async()=>{
   try{const checks=await store.checkSetup();cached={ready:Object.values(checks).every(check=>check.outcome==='pass'),configuration,checks,authenticatedFlow:'not_tested'};}
   catch{cached={ready:false,configuration,checks:{provider:{outcome:'failure',reason:'network_or_response_failure'}}};}
   until=Date.now()+cacheMs;return cached;
  })();
  try{return await pending;}finally{pending=null;}
 };
}
