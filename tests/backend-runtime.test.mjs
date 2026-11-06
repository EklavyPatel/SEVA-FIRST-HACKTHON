import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {backendConfiguration,createBackend} from '../server/runtime.js';
import {callHandler} from './http.js';

test('runtime validates local host, port, canonical origin and flags before starting storage',()=>{
 assert.deepEqual(backendConfiguration({}),{host:'127.0.0.1',port:3001,appOrigin:'http://127.0.0.1:5173',enableDemo:true,secureCookies:false});
 assert.equal(backendConfiguration({APP_ORIGIN:'https://example.invalid/'}).secureCookies,true);
 assert.equal(backendConfiguration({ENABLE_DEMO:' false '}).enableDemo,false);
 for(const env of [{HOST:'0.0.0.0'},{PORT:'0'},{PORT:'NaN'},{PORT:'65536'},{PORT:'3.1'},{APP_ORIGIN:'https://name:password@example.invalid/'},{APP_ORIGIN:'https://example.invalid/path'},{APP_ORIGIN:'ftp://example.invalid'},{SECURE_COOKIES:'yes'},{ENABLE_DEMO:'yes'}])assert.throws(()=>backendConfiguration(env));
});
test('runtime reports unconfigured Supabase services and denies signed-out requests',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'backend-runtime-'));let backend;
 try{
  backend=createBackend({env:{},cwd:directory});
  const response=await callHandler(backend.handler,{path:'/api/health',method:'GET'});
  assert.deepEqual(response.body.services,{analysis:'unconfigured',accounts:'unconfigured',community:'unconfigured',photos:'unconfigured'});
  assert.equal(response.body.connectivityChecked,false);
  assert.equal((await callHandler(backend.handler,{path:'/api/community/posts',method:'GET'})).status,401);
  assert.equal((await callHandler(backend.handler,{path:'/api/research/me',method:'GET'})).status,401);
  await assert.rejects(access(join(directory,'data/photo-outbox')));
  backend.close();backend.close();
  backend=createBackend({env:{},cwd:directory});assert.equal((await callHandler(backend.handler,{path:'/api/health',method:'GET'})).status,200);
 }finally{backend?.close();await rm(directory,{recursive:true,force:true});}
});
test('IPv6 loopback accepted by startup is also accepted by API host/origin checks',async()=>{
 const backend=createBackend({env:{HOST:'::1'},databasePath:':memory:'});
 try{const result=await callHandler(backend.handler,{path:'/api/health',method:'GET',headers:{host:'[::1]:3001',origin:'http://[::1]:3001'}});assert.equal(result.status,200);}finally{backend.close();}
});
