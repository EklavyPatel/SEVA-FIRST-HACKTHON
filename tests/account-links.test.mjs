import test from 'node:test';
import assert from 'node:assert/strict';
import {readAccountLink,prepareAccountLink} from '../src/lib/account-links.js';
import {createApp} from '../server/app.js';
import {callHandler} from './http.js';

test('standard Supabase callbacks route recovery/invitation correctly and discard refresh tokens',()=>{
 for(const type of ['recovery','invite','signup'])for(const prefix of ['#','#/reset-password#']){
  const link=readAccountLink({hash:prefix+'access_token=header.payload.signature&refresh_token=never-retain&type='+type});
  assert.equal(link.page,type==='signup'?'confirm':'reset-password');
  assert.equal(link.accessToken,'header.payload.signature');
  assert.ok(!JSON.stringify(link).includes('never-retain'));
 }
 assert.equal(readAccountLink({hash:'#/login'}),null);
});
test('custom hash links keep token verification in memory and remove credentials from browser history',()=>{
 let replaced;
 const browser={location:{pathname:'/',search:'',hash:'#/confirm?token_hash=fixture-hash'},history:{replaceState(...args){replaced=args[2];}}};
 const link=prepareAccountLink(browser);
 assert.equal(link.tokenHash,'fixture-hash');assert.equal(link.page,'confirm');assert.equal(replaced,'/#/confirm');
 const expired=readAccountLink({hash:'#error=access_denied&error_code=otp_expired&type=recovery'});
 assert.equal(expired.error,true);assert.equal(expired.page,'reset-password');
});
test('standard recovery callback verifies the bearer with Supabase before changing a password and revokes its temporary session',async()=>{
 const calls=[];let invalid=false;
 const app=createApp({supabaseUrl:'https://fixture.supabase.co',supabasePublicKey:'sb_publishable_fixture',accountFetchImpl:async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/user')&&options.method==='GET')return invalid?Response.json({code:'bad_jwt'},{status:401}):Response.json({id:'20000000-0000-4000-8000-000000000001',email_confirmed_at:'2026-01-01'});
  return Response.json({});
 }});
 const request=body=>callHandler(app,{path:'/api/account/reset-password',body});
 const body={type:'recovery',accessToken:'header.payload.signature',password:'fixture-new-password'};
 const response=await request(body);
 assert.equal(response.status,200);assert.match(response.headers['set-cookie'],/Max-Age=0/);
 assert.deepEqual(calls.map(c=>[new URL(c.url).pathname,c.options.method]),[['/auth/v1/user','GET'],['/auth/v1/user','PUT'],['/auth/v1/logout','POST']]);
 assert.equal(calls[0].options.headers.Authorization,'Bearer '+body.accessToken);
 assert.ok(!response.text.includes(body.accessToken));
 calls.length=0;invalid=true;
 assert.equal((await request(body)).status,401);
 assert.ok(!calls.some(c=>c.options.method==='PUT'));
 calls.length=0;
 assert.equal((await request({...body,error:true})).status,400);assert.equal(calls.length,0);
});
