import {resolve} from 'node:path';
import {researchConfiguration,createResearchReadiness} from './research-readiness.js';
import {createApp} from './app.js';
import {openResearchStore} from './research-store.js';
import {createSupabasePhotoStore} from './supabase-photos.js';
import {openPhotoOutbox} from './photo-outbox.js';

export function backendConfiguration(env={}) {
 const production=env.NODE_ENV==='production';
 const host=env.HOST?.trim()||'127.0.0.1';
 if(!['127.0.0.1','localhost','::1',...(production?['0.0.0.0']:[])].includes(host))throw new Error('Public binding requires production mode and an HTTPS application origin.');
 const port=Number(env.PORT?.trim()||3001);
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer from 1 to 65535.');
 let appOrigin;
 try{
  const parsed=new URL(env.APP_ORIGIN?.trim()||'http://127.0.0.1:5173');
  if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw Error();
  if(production&&(!env.APP_ORIGIN?.trim()||parsed.protocol!=='https:'))throw Error();
  appOrigin=parsed.origin;
 }catch{throw new Error('APP_ORIGIN must be an HTTP(S) origin without credentials, path, query or fragment.');}
 function flag(name,fallback){const value=env[name]?.trim();if(!value)return fallback;if(!['true','false'].includes(value))throw new Error(`${name} must be true or false.`);return value==='true';}
 return {host,port,appOrigin,enableDemo:flag('ENABLE_DEMO',true),secureCookies:flag('SECURE_COOKIES',false)||appOrigin.startsWith('https://')};
}

// Production wiring is shared with the offline smoke check. No sockets, external
// requests or environment-file loading happen merely by importing this module.
export function createBackend({env=process.env,cwd=process.cwd(),databasePath,photoFetchImpl,accountFetchImpl,clientFactory}={}) {
 const configuration=backendConfiguration(env);
 const photoConfiguration=researchConfiguration({url:env.SUPABASE_URL,publicKey:env.SUPABASE_PUBLISHABLE_KEY,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY});
 if(env.NODE_ENV==='production'&&!photoConfiguration.configured)throw new Error('Production requires complete Supabase photo-storage configuration.');
 if(env.NODE_ENV==='production'&&!env.GEMINI_API_KEY?.trim())throw new Error('Production requires the Gemini API key.');
 const dataDirectory=resolve(cwd,env.DATA_DIRECTORY?.trim()||'data');
 const researchStore=openResearchStore({path:databasePath??resolve(dataDirectory,'research.sqlite')});
 let closed=false;
 try{
  const photoStore=createSupabasePhotoStore({url:env.SUPABASE_URL,publicKey:env.SUPABASE_PUBLISHABLE_KEY,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,
   fetchImpl:photoFetchImpl,...(env.SUPABASE_SERVICE_ROLE_KEY?.trim()?{outbox:openPhotoOutbox(resolve(dataDirectory,'photo-outbox'))}:{})});
  const researchReadiness=createResearchReadiness({configuration:photoConfiguration,store:photoStore});
  const handler=createApp({...configuration,researchStore,photoStore,researchReadiness,
   apiKey:env.GEMINI_API_KEY?.trim()||'',model:env.GEMINI_MODEL?.trim()||'gemini-3.8-flash',
   supabaseUrl:env.SUPABASE_URL||'',supabasePublicKey:env.SUPABASE_PUBLISHABLE_KEY||'',accountFetchImpl,clientFactory});
  return {handler,...configuration,researchReadiness,publicResearchAccess:photoStore?.publicAccess===true,close(){if(!closed){closed=true;researchStore.close();}}};
 }catch(error){researchStore.close();throw error;}
}
