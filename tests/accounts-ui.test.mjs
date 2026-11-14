import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
const oldEnv=process.env.NODE_ENV;
await build({logLevel:'error',build:{ssr:'src/components/Account.jsx',outDir:'artifacts/accounts-ssr',emptyOutDir:true}});
if(oldEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldEnv;
const {default:Account,accountErrorMessage,accountRequest}=await import('../artifacts/accounts-ssr/Account.js');
test('rate messages identify cause and include retry timing only when known',()=>{
 assert.match(accountErrorMessage({code:'ACCOUNT_EMAIL_RATE'},'en'),/confirmation email sending limit/);
 assert.ok(!accountErrorMessage({code:'ACCOUNT_EMAIL_RATE'},'en').includes('seconds'));
 assert.match(accountErrorMessage({code:'ACCOUNT_LOCAL_RATE',retryAfterSeconds:42},'en'),/Retry in 42 seconds/);
 assert.match(accountErrorMessage({code:'ACCOUNT_EMAIL_RECIPIENT'},'en'),/custom SMTP/);
});
test('pending signup disables submit, rejects same-tick duplicate and never automatically retries',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://127.0.0.1:5173'});
 globalThis.window=dom.window;globalThis.document=dom.window.document;
 globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const originalFetch=globalThis.fetch;let resolveFetch,calls=0;
 globalThis.fetch=()=>{calls++;return new Promise(resolve=>{resolveFetch=resolve;});};
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));
 try{
  await act(async()=>root.render(React.createElement(Account,{language:'en',page:'signup',configured:true,user:null})));
  const form=document.querySelector('form');
  await act(async()=>{for(let i=0;i<2;i++)form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));});
  assert.equal(calls,1);assert.equal(document.querySelector('button[type="submit"]').disabled,true);
  await act(async()=>{resolveFetch(Response.json({error:{code:'ACCOUNT_EMAIL_RATE',retryAfterSeconds:12}},{status:429,headers:{'Retry-After':'12'}}));});
  assert.equal(calls,1);assert.equal(document.querySelector('button[type="submit"]').disabled,false);
  assert.match(document.querySelector('[role="alert"]').textContent,/confirmation email sending limit.*Retry in 12 seconds/);
 }finally{await act(async()=>root.unmount());dom.window.close();globalThis.fetch=originalFetch;}
});
test('browser request retains known timing and makes exactly one fetch',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return Response.json({error:{code:'ACCOUNT_PROVIDER_RATE',retryAfterSeconds:17}},{status:429});};
  await assert.rejects(()=>accountRequest('/signup',{}),e=>e.code==='ACCOUNT_PROVIDER_RATE'&&e.retryAfterSeconds===17);
  assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});

async function mountDashboard({user={id:'admin-user',email:'admin@example.invalid',role:'admin'},page='admin',language='en',fetchImpl}={}) {
 const dom=new JSDOM('<div id="root"></div>',{url:'http://127.0.0.1:5173/#/'+page});
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const originalFetch=globalThis.fetch;globalThis.fetch=fetchImpl;
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));
 await act(async()=>{root.render(React.createElement(Account,{user,page,language,configured:true,onChanged:async()=>{}}));});
 return {async click(name){const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===name);assert.ok(button,'Missing button: '+name);await act(async()=>button.click());},async cleanup(){await act(async()=>root.unmount());globalThis.fetch=originalFetch;dom.window.close();}};
}
async function setDashboardField(element,value){
 const setter=Object.getOwnPropertyDescriptor(element.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype,'value').set;
 await act(async()=>{setter.call(element,value);element.dispatchEvent(new window.Event('input',{bubbles:true}));element.dispatchEvent(new window.Event('change',{bubbles:true}));});
}
const dashboardRequest=(overrides={})=>({id:'application-a',user_id:'research-user',kind:'university',applicant_name:'Research Applicant',institution:'Cotton Institute',purpose:'Compare visible cotton leaf symptoms.',intended_use:'Study deidentified images with farmer consent.',status:'pending',revision:4,created_at:'2026-11-10T08:00:00Z',history:[],...overrides});
test('admin filters/search show page-scoped data and preserve review revisions, reason requirements and self-review protection',async()=>{
 const rows=[dashboardRequest(),dashboardRequest({id:'own',user_id:'admin-user',applicant_name:'Own Application'}),dashboardRequest({id:'approved',user_id:'approved-user',status:'approved',applicant_name:'Approved Applicant'})];
 const writes=[],reads=[];
 const ui=await mountDashboard({fetchImpl:async(path,options={})=>{
  if(path==='/api/account/review'){const input=JSON.parse(options.body);writes.push(input);rows.find(r=>r.id===input.id).status=input.decision;return Response.json({reviewed:true});}
  reads.push(path);const status=new URL(path,'http://local').searchParams.get('status');
  return Response.json({requests:rows.filter(r=>status==='all'||(status==='pending'?r.status==='pending':r.status!=='pending')),hasMore:false});
 }});
 try {
  assert.equal(document.querySelectorAll('.admin-request').length,2);
  assert.match(document.querySelector('.admin-queue .account-section-heading').textContent,/Counts reflect the current page only/);
  assert.deepEqual([...document.querySelectorAll('.admin-summary dd')].map(x=>x.textContent),['2','2','0']);
  const own=[...document.querySelectorAll('.admin-request')].find(x=>x.textContent.includes('Own Application'));
  assert.equal([...own.querySelectorAll('button')].find(x=>x.textContent.includes('Approve')).disabled,true);
  assert.equal(own.querySelector('textarea').disabled,true);
  const first=document.querySelector('.admin-request');
  assert.equal([...first.querySelectorAll('button')].find(x=>x.textContent.includes('Reject')).disabled,true);
  await setDashboardField(document.querySelector('.admin-search input'),'no matches');
  assert.equal(document.querySelectorAll('.admin-request').length,0);
  assert.match(document.querySelector('.dashboard-empty').textContent,/No matching applications/);
  await ui.click('Clear search');
  await setDashboardField(document.querySelector('.admin-search input'),'Research Applicant');
  assert.equal(document.querySelectorAll('.admin-request').length,1);
  await ui.click('Approve');
  assert.deepEqual(writes[0],{id:'application-a',revision:4,decision:'approved',reason:''});
  assert.match(document.querySelector('[role=status]').textContent,/Decision recorded/);
  await ui.click('Reviewed');
  assert.ok(reads.at(-1).includes('status=reviewed&offset=0'));
  assert.equal(document.querySelector('.admin-search input').value,'');
  const card=document.querySelector('.admin-request');
  const revoke=card.querySelector('button');assert.equal(revoke.disabled,true);
  await setDashboardField(card.querySelector('textarea'),'Project access period has ended.');
  assert.equal(revoke.disabled,false);
  await act(async()=>revoke.click());
  assert.equal(writes.at(-1).decision,'revoked');
  assert.equal(writes.at(-1).reason,'Project access period has ended.');
 } finally {await ui.cleanup();}
});
test('failed admin loading offers an enabled refresh and pagination honors server offsets',async()=>{
 let fail=true;const reads=[];
 const ui=await mountDashboard({fetchImpl:async path=>{
  reads.push(path);if(fail)return Response.json({error:{code:'ACCOUNT_NETWORK'}},{status:503});
  const offset=new URL(path,'http://local').searchParams.get('offset');
  return Response.json({requests:offset==='0'?[dashboardRequest()]:[],hasMore:offset==='0'});
 }});
 try {
  assert.match(document.querySelector('.dashboard-empty').textContent,/Applications could not be loaded/);
  const refresh=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Refresh status'));
  assert.equal(refresh.disabled,false,'A failed load must remain retryable');
  fail=false;await ui.click('Refresh status');
  assert.equal(document.querySelectorAll('.admin-request').length,1);
  await ui.click('Next');
  assert.ok(reads.at(-1).includes('offset=25'));
  assert.match(document.querySelector('.admin-pagination').textContent,/Page 2/);
  await ui.click('Previous');
  assert.ok(reads.at(-1).includes('offset=0'));
 } finally {await ui.cleanup();}
});
test('My Account distinguishes contribution from approved dataset access and localizes Gujarati status',async()=>{
 const ui=await mountDashboard({page:'account',language:'gu',user:{id:'farmer',email:'farmer@example.invalid',role:'farmer'},fetchImpl:async()=>Response.json({requests:[dashboardRequest({status:'pending'})]})});
 try {
  assert.match(document.querySelector('.account-profile').textContent,/farmer@example.invalid/);
  assert.equal(document.querySelector('.account-profile').textContent.includes('Normal user'),false);
  assert.equal(document.querySelectorAll('.account-action-card').length,3);
  assert.match(document.querySelector('.account-permissions').textContent,/દરેક પ્રવેશ કરેલું ખાતું/);
  assert.match(document.querySelector('.account-permissions').textContent,/વ્યવસ્થાપકની મંજૂરી જરૂરી/);
  assert.match(document.querySelector('.account-application').textContent,/સમીક્ષા બાકી/);
  assert.ok(document.querySelector('.account-access a[href="#/request-research"]'));
  assert.equal(document.querySelector('.account-access a[href="#/research"]'),null);
  assert.equal(document.querySelector('.account-local-nav [aria-current=page]').getAttribute('href'),'#/account');
 } finally {await ui.cleanup();}
});
