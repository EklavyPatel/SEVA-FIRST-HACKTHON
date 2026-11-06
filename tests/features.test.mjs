import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAuthenticatedApp as createApp} from './helpers/authenticated-app.mjs';
import {openResearchStore} from '../server/research-store.js';
import {callHandler} from './http.js';
import {sdkMock} from './sdk-mock.js';
const jpeg=await readFile(new URL('./fixtures/cotton-illustration.jpg',import.meta.url));
const image={mimeType:'image/jpeg',base64:jpeg.toString('base64')};
const request=(app,path,method='GET',body,cookie)=>callHandler(app,{path,method,body,headers:cookie?{cookie}:{}});
const cookie=r=>r.headers['set-cookie']?.split(';')[0];
test('community requires sharing consent and preserves author control over posts and replies',async()=>{
 const s=openResearchStore({path:':memory:'});const app=createApp({researchStore:s});try{
 const input={title:'Cotton leaf question',body:'Synthetic test observation',alias:'Fixture farmer',shared:true};
 assert.equal((await request(app,'/api/community/posts','POST',{...input,shared:false})).status,400);
 const post=await request(app,'/api/community/posts','POST',input);assert.equal(post.status,201);const id=post.body.post.id;const owner=await app.login('a');
 const reply=await request(app,`/api/community/posts/${id}/replies`,'POST',{body:'Please ask a local expert.',alias:'Fixture neighbor',shared:true,staff:true});assert.equal(reply.status,201);assert.equal(reply.body.post.replies[0].staff,0);
 const other=await app.login('b');assert.equal((await request(app,`/api/community/posts/${id}`,'DELETE',undefined,other)).status,403);
 assert.equal((await request(app,`/api/community/posts/${id}/status`,'POST',{resolved:true},owner)).body.post.resolved,1);
 assert.equal((await request(app,`/api/community/posts/${id}`,'DELETE',undefined,owner)).status,200);
 assert.equal((await request(app,'/api/community/posts')).body.posts.length,0);
 }finally{s.close();}
});
test('community never assigns researcher badges from user-supplied fields',async()=>{
 const s=openResearchStore({path:':memory:'});const app=createApp({researchStore:s});try{
 const post=await request(app,'/api/community/posts','POST',{title:'Field question',body:'Fixture',alias:'Neighbor',shared:true});
 const staffCookie=await app.login('staff');
 const r=await request(app,`/api/community/posts/${post.body.post.id}/replies`,'POST',{body:'Needs further evidence.',alias:'Forged name',shared:true},staffCookie);
 assert.equal(r.body.post.replies[0].staff,1);assert.match(r.body.post.replies[0].alias,/Approved researcher/);
 }finally{s.close();}
});
test('follow-up sends the original image, bounded conversation and current question to Gemini',async()=>{
 let sent,calls=0;const app=createApp({apiKey:'TEST ONLY',clientFactory:sdkMock(async opts=>{sent=opts;calls++;return{text:'Inspect the leaf undersides in daylight. What changed recently?',candidates:[{finishReason:'STOP'}]};})});
 const data={image,language:'en',question:'What should I inspect?',history:[{role:'user',text:'The marks appeared yesterday.'},{role:'model',text:'I need more visual evidence.'}],consent:true};
 const r=await request(app,'/api/followup','POST',data);assert.equal(r.status,200);assert.equal(calls,1);assert.equal(r.body.persisted,false);assert.ok(sent.contents[0].parts[0].inlineData.data.length>100);assert.equal(sent.contents.at(-1).parts[0].text,data.question);assert.match(sent.config.systemInstruction,/Do not prescribe chemicals/);
 assert.equal((await request(app,'/api/followup','POST',{...data,consent:false})).status,400);
 assert.equal((await request(app,'/api/followup','POST',{...data,history:Array(12).fill({role:'user',text:'x'})})).status,400);assert.equal(calls,1);
 assert.equal((await request(app,'/api/followup','POST',{...data,history:[null,null]})).status,400);
});
test('follow-up refuses missing keys, incomplete output and dosage responses without silent fallbacks',async()=>{
 const data={image,language:'gu',question:'What next?',history:[],consent:true};
 assert.equal((await request(createApp(),'/api/followup','POST',data)).status,503);
 for(const response of [{text:'incomplete',candidates:[{finishReason:'MAX_TOKENS'}]},{text:'Use 10 ml',candidates:[{finishReason:'STOP'}]}]){
 const app=createApp({apiKey:'TEST ONLY',clientFactory:sdkMock(async()=>response)});assert.equal((await request(app,'/api/followup','POST',data)).status,502);}
});
