import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';
import {callHandler} from './http.js';
import {retryAfterSeconds} from '../server/account-rate-limit.js';
const credentials={email:'fixture@example.invalid',password:'fixture-password-only'};
const setup=fetchImpl=>createApp({supabaseUrl:'https://fixture.supabase.co',supabasePublicKey:'sb_publishable_fixture',accountFetchImpl:fetchImpl});
const signup=app=>callHandler(app,{path:'/api/account/signup',body:credentials});

test('confirmation email exhaustion does not block repeated password logins',async()=>{
 const paths=[];
 const app=setup(async(raw)=>{
  const url=new URL(raw);paths.push(url.pathname);
  if(url.pathname==='/auth/v1/signup')return Response.json({code:'over_email_send_rate_limit'},{status:429});
  if(url.pathname==='/auth/v1/token'){
   assert.equal(url.searchParams.get('grant_type'),'password');
   return Response.json({access_token:'fixture-token',expires_in:3600,user:{email_confirmed_at:'2026-01-01'}});
  }
  throw Error('Unexpected auth request');
 });
 const exhausted=await signup(app);
 assert.equal(exhausted.status,429);
 assert.equal(exhausted.body.error.code,'ACCOUNT_EMAIL_RATE');
 for(let i=0;i<5;i++){
  const login=await callHandler(app,{path:'/api/account/login',body:credentials});
  assert.equal(login.status,200);
  assert.equal(login.body.signedIn,true);
  assert.match(login.headers['set-cookie'],/HttpOnly/);
  assert.ok(!login.text.includes('fixture-token'));
 }
 assert.deepEqual(paths,['/auth/v1/signup',...Array(5).fill('/auth/v1/token')]);
});
test('email quota, provider request quota, unknown 429 and recipient restriction stay distinct',async()=>{
 for(const [status,providerCode,expected] of [[429,'over_email_send_rate_limit','ACCOUNT_EMAIL_RATE'],[429,'over_request_rate_limit','ACCOUNT_PROVIDER_RATE'],[429,'PRIVATE_BODY','ACCOUNT_PROVIDER_RATE'],[400,'email_address_not_authorized','ACCOUNT_EMAIL_RECIPIENT'],[400,'invalid_credentials','ACCOUNT_CREDENTIALS']]){
  let calls=0;
  const response=await signup(setup(async()=>{calls++;return Response.json({error_code:providerCode,message:'PRIVATE_BODY'},{status});}));
  assert.equal(response.body.error.code,expected);assert.equal(calls,1);
  assert.equal(response.headers['retry-after'],undefined);
  assert.ok(!response.text.includes('PRIVATE_BODY'));
  if(status===429){assert.equal(response.status,429);assert.equal(response.body.error.source,'supabase');assert.equal(response.body.error.providerStatus,429);assert.equal(response.body.error.retryAfterSeconds,null);}
 }
});
test('known retry header is propagated; invalid and missing retry timing are not invented',async()=>{
 for(const [header,expected] of [['23',23],['nonsense',null],['-5',null]]){
  const response=await signup(setup(async()=>Response.json({code:'over_email_send_rate_limit'},{status:429,headers:{'Retry-After':header}})));
  assert.equal(response.body.error.retryAfterSeconds,expected);
  assert.equal(response.headers['retry-after'],expected===null?undefined:String(expected));
 }
 const now=Date.parse('2026-01-01T00:00:00Z');
 assert.equal(retryAfterSeconds('Thu, 01 Jan 2026 00:01:00 GMT',now),60);
 assert.equal(retryAfterSeconds('Thu, 01 Jan 2026 00:00:00 GMT',now+1000),null);
 assert.equal(retryAfterSeconds('999999999999999999999'),null);
 const response=await signup(setup(async()=>new Response('<html>PRIVATE_BODY</html>',{status:429})));
 assert.equal(response.body.error.code,'ACCOUNT_PROVIDER_RATE');
 assert.ok(!response.text.includes('PRIVATE_BODY'));
});
test('local limiter blocks attempt 16 before provider call, reports remaining window and stays isolated per app',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;return Response.json({});};const app=setup(fetchImpl);
 for(let i=0;i<15;i++)assert.equal((await signup(app)).status,202);
 const response=await signup(app);assert.equal(response.status,429);assert.equal(calls,15);
 assert.equal(response.body.error.code,'ACCOUNT_LOCAL_RATE');assert.equal(response.body.error.source,'backend');
 assert.ok(response.body.error.retryAfterSeconds>0&&response.body.error.retryAfterSeconds<=600);
 assert.equal(response.headers['retry-after'],String(response.body.error.retryAfterSeconds));
 assert.equal((await signup(setup(fetchImpl))).status,202);
});
