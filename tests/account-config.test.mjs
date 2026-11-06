import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { accountConfiguration } from '../server/account-config.js';
import { loadBackendEnvironment } from '../server/env.js';
import { createApp } from '../server/app.js';
import { callHandler } from './http.js';
const publicKey = 'sb_publishable_isolated_test';
const email = 'fixture@example.invalid';
const password = 'fixture-password-only';
const call = (app,path,body,cookie) => callHandler(app,{path:'/api/account'+path,method:body===undefined?'GET':'POST',body,headers:cookie?{cookie}:{}});
const appWith = fn => createApp({supabaseUrl:'https://fixture.supabase.co',supabasePublicKey:publicKey,accountFetchImpl:fn});

test('runtime ignores example files, loads api.env before .env, and preserves process overrides', () => {
 const cwd=mkdtempSync(join(tmpdir(),'km-config-'));try{
  writeFileSync(join(cwd,'api.env.example'),`SUPABASE_URL=https://fixture.supabase.co\nSUPABASE_PUBLISHABLE_KEY=${publicKey}\n`);
  const env={};loadBackendEnvironment({cwd,env});assert.equal(accountConfiguration({url:env.SUPABASE_URL,publicKey:env.SUPABASE_PUBLISHABLE_KEY}).configured,false);
  writeFileSync(join(cwd,'api.env'),`SUPABASE_URL=https://fixture.supabase.co\nSUPABASE_PUBLISHABLE_KEY=${publicKey}\nGEMINI_API_KEY=isolated-file-key\n`);
  writeFileSync(join(cwd,'.env'),'SUPABASE_URL=https://wrong.supabase.co\n');
  const effective={GEMINI_API_KEY:'isolated-process-key'};loadBackendEnvironment({cwd,env:effective});
  assert.equal(effective.SUPABASE_URL,'https://fixture.supabase.co');assert.equal(effective.GEMINI_API_KEY,'isolated-process-key');
  assert.equal(accountConfiguration({url:effective.SUPABASE_URL,publicKey:effective.SUPABASE_PUBLISHABLE_KEY}).configured,true);
 }finally{rmSync(cwd,{recursive:true,force:true});}
});

test('configuration accepts trimmed public keys and project API URLs but rejects dashboard/elevated keys without disabling guest health',async()=>{
 assert.equal(accountConfiguration({url:' https://fixture.supabase.co/ ',publicKey:' '+publicKey+' '}).configured,true);
 const jwt=role=>`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({role})).toString('base64url')}.fixture`;
 assert.equal(accountConfiguration({url:'https://fixture.supabase.co',publicKey:jwt('anon')}).configured,true);
 for(const options of [{url:'https://supabase.com/dashboard/project/fixture',publicKey},{url:'https://fixture.supabase.co',publicKey:'sb_secret_fixture'},{url:'https://fixture.supabase.co',publicKey:jwt('service_role')}]){
  assert.equal(accountConfiguration(options).configured,false);
  const app=createApp({supabaseUrl:options.url,supabasePublicKey:options.publicKey});
  assert.equal((await call(app,'/me')).body.configured,false);
  assert.equal((await callHandler(app,{path:'/api/health',method:'GET'})).status,200);
 }
});

test('DNS, timeout, rejected keys, bad credentials, unconfirmed email and missing schema have distinct sanitized errors',async()=>{
 const cases=[
  [async()=>{throw Object.assign(new TypeError('PRIVATE URL'),{cause:{code:'EAI_AGAIN'}});},'ACCOUNT_NETWORK',503],
  [async()=>{throw Object.assign(new Error('PRIVATE'),{name:'TimeoutError'});},'ACCOUNT_TIMEOUT',503],
  [async()=>Response.json({message:'PRIVATE API KEY'},{status:401}),'ACCOUNT_KEY',503],
  [async()=>Response.json({code:'invalid_credentials',msg:'PRIVATE'},{status:400}),'ACCOUNT_CREDENTIALS',401],
  [async()=>Response.json({error_code:'email_not_confirmed',msg:'PRIVATE'},{status:400}),'ACCOUNT_CONFIRMATION',401],
  [async()=>Response.json({code:'user_already_exists',msg:'PRIVATE'},{status:422}),'ACCOUNT_EXISTS',400],
  [async()=>Response.json({code:'PGRST205',message:'PRIVATE schema'},{status:404}),'ACCOUNT_SCHEMA',503],
  [async()=>new Response('<html>PRIVATE</html>',{status:502}),'ACCOUNT_RESPONSE',502],
 ];
 for(const[fetch,code,status]of cases){const r=await call(appWith(fetch),'/login',{email,password});assert.equal(r.status,status);assert.equal(r.body.configured,true);assert.equal(r.body.error.code,code);assert.ok(!r.text.includes('PRIVATE'));}
});

test('confirmation redirect is server-controlled; repeated signup never auto-signs in',async()=>{
 let url,body;
 const app=appWith(async(u,o)=>{url=u;body=JSON.parse(o.body);return Response.json({id:'fixture',identities:[]});});
 const r=await call(app,'/signup',{email,password,role:'admin',redirect_to:'https://attacker.invalid'});
 assert.equal(r.status,202);assert.equal(r.headers['set-cookie'],undefined);assert.deepEqual(body,{email,password});
 assert.equal(new URL(url).searchParams.get('redirect_to'),'http://127.0.0.1:5173/#/login');
});

test('session restores across refresh, clears expired upstream tokens and logs out locally despite a provider outage',async()=>{
 let expired=false,outage=false;
 const app=appWith(async url=>{
  if(url.includes('/token?'))return Response.json({access_token:'fixture-token',expires_in:3600,user:{email_confirmed_at:'2026-01-01'}});
  if(url.includes('/user'))return expired?Response.json({code:'bad_jwt'},{status:401}):Response.json({id:'00000000-0000-4000-8000-000000000001',email,email_confirmed_at:'2026-01-01'});
  if(url.includes('km_account_roles'))return Response.json([]);
  if(outage)throw Error('PRIVATE network error');
  return Response.json({});
 });
 const login=async()=>{const r=await call(app,'/login',{email,password});return r.headers['set-cookie'].split(';')[0];};
 let cookie=await login();
 for(let i=0;i<2;i++){const me=await call(app,'/me',undefined,cookie);assert.equal(me.body.user.role,'farmer');}
 expired=true;assert.equal((await call(app,'/me',undefined,cookie)).body.user,null);
 expired=false;cookie=await login();outage=true;
 assert.equal((await call(app,'/logout',{},cookie)).status,200);assert.equal((await call(app,'/me',undefined,cookie)).body.user,null);
});

test('missing role table keeps configured true and cannot masquerade as successful account restoration',async()=>{
 const app=appWith(async url=>{
  if(url.includes('/token?'))return Response.json({access_token:'fixture',expires_in:3600,user:{email_confirmed_at:'2026-01-01'}});
  if(url.includes('/user'))return Response.json({id:'00000000-0000-4000-8000-000000000001',email_confirmed_at:'2026-01-01'});
  return Response.json({code:'PGRST205'},{status:404});
 });
 const login=await call(app,'/login',{email,password});const cookie=login.headers['set-cookie'].split(';')[0];
 const me=await call(app,'/me',undefined,cookie);assert.equal(me.status,503);assert.equal(me.body.configured,true);assert.equal(me.body.error.code,'ACCOUNT_SCHEMA');
});

test('two accounts receive their own request filters even when a caller supplies another user ID in the URL',async()=>{
 const ids={a:'00000000-0000-4000-8000-000000000001',b:'00000000-0000-4000-8000-000000000002'};
 const seen=[];
 const app=appWith(async(url,options)=>{
  const u=new URL(url);
  if(u.pathname==='/auth/v1/token'){
   const label=JSON.parse(options.body).email.startsWith('a@')?'a':'b';
   return Response.json({access_token:label,expires_in:3600,user:{email_confirmed_at:'2026-01-01'}});
  }
  const label=options.headers.Authorization?.slice(7);
  if(u.pathname==='/auth/v1/user')return Response.json({id:ids[label],email_confirmed_at:'2026-01-01'});
  if(u.pathname.includes('km_account_roles'))return Response.json([]);
  if(u.pathname.includes('km_access_request_history'))return Response.json([]);
  if(u.pathname.includes('km_access_requests')){
   const filter=u.searchParams.get('user_id');seen.push(filter);
   assert.equal(filter,'eq.'+ids[label]);
   return Response.json([{id:label,user_id:ids[label],status:'pending'}]);
  }
  throw Error('Unexpected fixture request');
 });
 const cookies={};
 for(const label of ['a','b']){const r=await call(app,'/login',{email:label+'@example.invalid',password});cookies[label]=r.headers['set-cookie'].split(';')[0];}
 for(const label of ['a','b']){
  const r=await call(app,'/requests?user_id='+ids[label==='a'?'b':'a'],undefined,cookies[label]);
  assert.equal(r.status,200);assert.equal(r.body.requests[0].user_id,ids[label]);assert.equal(r.body.requests.length,1);
 }
 assert.equal(seen.length,2);
});

test('existing accounts with older password lengths reach Auth, while signup retains its stronger minimum',async()=>{
 let calls=0;
 const app=appWith(async()=>{calls++;return Response.json({code:'invalid_credentials'},{status:400});});
 assert.equal((await call(app,'/login',{email,password:'old123'})).body.error.code,'ACCOUNT_CREDENTIALS');
 assert.equal(calls,1);
 assert.equal((await call(app,'/signup',{email,password:'old123'})).body.error.code,'ACCOUNT_INPUT');
 assert.equal(calls,1);
});
