import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';
import {accountProvider} from './helpers/account-provider.mjs';
import {openResearchStore} from '../server/research-store.js';
import {callHandler} from './http.js';

async function fixture(result,options={}){
 const provider=accountProvider(),calls=[];
 const app=createApp({supabaseUrl:'https://fixture.supabase.co',supabasePublicKey:'sb_publishable_fixture',accountFetchImpl:async(url,init)=>{
  if(url.endsWith('/rpc/km_community')){calls.push({url,init,body:JSON.parse(init.body)});return result();}
  return provider.fetchImpl(url,init);
 },...options});
 const login=await callHandler(app,{path:'/api/account/login',body:{email:'a@example.invalid',password:'fixture-password'}});
 const cookie=login.headers['set-cookie'].split(';')[0];
 return {app,calls,call:(path,body,method=body?'POST':'GET')=>callHandler(app,{path:'/api/community'+path,method,body,headers:{cookie}})};
}
test('community uses the verified user JWT and sends only allowed shared fields to Supabase',async()=>{
 const s=await fixture(()=>Response.json({post:{id:'fixture',mine:true,replies:[]}}));
 const response=await s.call('/posts',{title:'Cotton question',body:'Synthetic observation',alias:'Farmer',shared:true,owner_user_id:'forged',staff:true,created_at:'forged'});
 assert.equal(response.status,201);assert.equal(response.body.storage,'supabase');assert.equal(response.body.supabaseConnected,true);
 assert.equal(s.calls[0].init.headers.Authorization,'Bearer a');assert.equal(s.calls[0].init.headers.apikey,'sb_publishable_fixture');
 assert.deepEqual(s.calls[0].body.input,{title:'Cotton question',body:'Synthetic observation',alias:'Farmer',shared:true});
 const health=await callHandler(s.app,{path:'/api/health',method:'GET'});assert.equal(health.body.services.community,'supabase');
 assert.equal((await callHandler(s.app,{path:'/api/community/posts',method:'GET'})).status,401);
 assert.equal((await s.call('/posts',{title:'Question',body:'Text',alias:'Farmer',shared:false})).status,400);assert.equal(s.calls.length,1);
});
test('missing Supabase community schema returns an error even when a legacy SQLite store exists',async()=>{
 const store=openResearchStore({path:':memory:'});
 try{
  const s=await fixture(()=>Response.json({code:'PGRST202'},{status:404}),{researchStore:store});
  const response=await s.call('/posts');
  assert.equal(response.status,503);assert.equal(response.body.error.code,'ACCOUNT_SCHEMA');assert.equal(store.community.list(null).length,0);
 }finally{store.close();}
});
test('community permission and input failures have safe messages; invalid statuses never reach Supabase',async()=>{
 const s=await fixture(()=>Response.json({code:'42501',message:'PRIVATE DATABASE DETAILS'},{status:403}));
 const id='80000000-0000-4000-8000-000000000001';
 const denied=await s.call('/posts/'+id,undefined,'DELETE');
 assert.equal(denied.status,403);assert.equal(denied.body.error.code,'COMMUNITY_OWNER');assert.ok(!denied.text.includes('PRIVATE'));
 assert.equal((await s.call('/posts/'+id+'/status',{resolved:'yes'})).status,400);assert.equal(s.calls.length,1);
});
