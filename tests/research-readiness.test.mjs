import test from 'node:test';
import assert from 'node:assert/strict';
import {researchConfiguration,createResearchReadiness} from '../server/research-readiness.js';
import {createSupabasePhotoStore} from '../server/supabase-photos.js';
import {backendConfiguration,createBackend} from '../server/runtime.js';
import {photoProvider} from './helpers/supabase-photos.mjs';
import {callHandler} from './http.js';
const settings={url:'https://fixture.supabase.co',publicKey:'sb_publishable_fixture',serviceKey:'sb_secret_fixture_photos'};
const outbox={add(){},remove(){},entries(){return [];}};
test('configuration identifies missing/elevated keys without ever returning their values',()=>{
 const missing=researchConfiguration({...settings,serviceKey:''});assert.equal(missing.configured,false);assert.deepEqual(missing.missing,['SUPABASE_SERVICE_ROLE_KEY']);
 for(const key of ['sb_publishable_fixture','invalid-key'])assert.equal(researchConfiguration({...settings,serviceKey:key}).issue,'invalid_server_key');
 const valid=researchConfiguration(settings);assert.equal(valid.configured,true);assert.ok(!JSON.stringify(valid).includes(settings.serviceKey));
});
test('metadata readiness is read-only, rejects unsafe buckets, and caches duplicate requests',async()=>{
 const provider=photoProvider();let unsafe=false;
 const store=createSupabasePhotoStore({...settings,outbox,fetchImpl:async(url,options)=>{
  if(unsafe&&url.includes('/storage/v1/bucket/'))return Response.json({id:'km-crop-photos',public:true,file_size_limit:3145728,allowed_mime_types:['image/jpeg']});
  return provider.fetchImpl(url,options);
 }});
 const ready=createResearchReadiness({configuration:researchConfiguration(settings),store});
 const result=await ready();assert.equal(result.ready,true);const count=provider.calls.length;await ready();assert.equal(provider.calls.length,count);
 assert.equal(provider.rows.length,0);assert.equal(provider.objects.size,0);assert.ok(!JSON.stringify(result).includes('sb_secret_'));
 unsafe=true;const failed=await createResearchReadiness({configuration:researchConfiguration(settings),store})();assert.equal(failed.ready,false);assert.equal(failed.checks.bucket.reason,'RESEARCH_BUCKET');
});
test('missing schemas, rejected credentials and absent RPCs are reported as distinct blockers',async()=>{
 for(const [status,body,reason] of [[404,{code:'PGRST205'},'RESEARCH_SCHEMA'],[401,{message:'PRIVATE CREDENTIAL'},'RESEARCH_STORAGE_KEY'],[404,{code:'PGRST202'},'RESEARCH_SCHEMA']]){
  const store=createSupabasePhotoStore({...settings,outbox,fetchImpl:async()=>Response.json(body,{status})});
  const result=await createResearchReadiness({configuration:researchConfiguration(settings),store})();assert.equal(result.ready,false);assert.equal(result.checks.submissions.reason,reason);assert.ok(!JSON.stringify(result).includes('PRIVATE'));
 }
});
test('production supports container binding only with HTTPS and configured dependencies',async()=>{
 assert.throws(()=>backendConfiguration({NODE_ENV:'production',HOST:'0.0.0.0'}));
 assert.throws(()=>backendConfiguration({NODE_ENV:'production',HOST:'0.0.0.0',APP_ORIGIN:'http://example.invalid'}));
 assert.equal(backendConfiguration({NODE_ENV:'production',HOST:'0.0.0.0',APP_ORIGIN:'https://example.invalid'}).host,'0.0.0.0');
 assert.throws(()=>createBackend({env:{NODE_ENV:'production',APP_ORIGIN:'https://example.invalid'},databasePath:':memory:'}));
 const backend=createBackend({env:{},databasePath:':memory:'});
 try{assert.equal((await callHandler(backend.handler,{path:'/api/health',method:'GET'})).status,200);const ready=await callHandler(backend.handler,{path:'/api/ready',method:'GET'});assert.equal(ready.status,503);assert.deepEqual(ready.body.research.configuration.missing,['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY']);}finally{backend.close();}
});

test('production wiring passes readiness with mocked private infrastructure and canonical HTTPS host',async()=>{
 const {mkdtemp,rm,access}=await import('node:fs/promises');
 const {join}=await import('node:path');const {tmpdir}=await import('node:os');
 const directory=await mkdtemp(join(tmpdir(),'production-research-'));const provider=photoProvider();let backend;
 try{
  backend=createBackend({cwd:directory,env:{NODE_ENV:'production',HOST:'0.0.0.0',APP_ORIGIN:'https://example.invalid',GEMINI_API_KEY:'fixture-gemini',SUPABASE_URL:settings.url,SUPABASE_PUBLISHABLE_KEY:settings.publicKey,SUPABASE_SERVICE_ROLE_KEY:settings.serviceKey,DATA_DIRECTORY:'persistent'},photoFetchImpl:provider.fetchImpl,accountFetchImpl:provider.fetchImpl});
  await access(join(directory,'persistent','photo-outbox'));
  const response=await callHandler(backend.handler,{path:'/api/ready',method:'GET',headers:{host:'example.invalid',origin:'https://example.invalid'}});
  assert.equal(response.status,200);assert.equal(response.body.ready,true);assert.equal(response.body.research.authenticatedFlow,'not_tested');
  assert.ok(!response.text.includes(settings.serviceKey));assert.equal(provider.objects.size,0);assert.equal(provider.rows.length,0);
 }finally{backend?.close();await rm(directory,{recursive:true,force:true});}
});
