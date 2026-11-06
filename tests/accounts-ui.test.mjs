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
