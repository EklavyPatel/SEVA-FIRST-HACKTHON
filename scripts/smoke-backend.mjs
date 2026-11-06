// Offline smoke check: production wiring, disposable SQLite, no real credentials,
// provider requests, TCP listeners, signup emails or live database writes.
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBackend} from '../server/runtime.js';
import {callHandler} from '../tests/http.js';
const directory=await mkdtemp(join(tmpdir(),'kapasmitra-backend-'));
let backend;
const originalFetch=globalThis.fetch;let networkRequests=0;
globalThis.fetch=async()=>{networkRequests++;throw new Error('Offline smoke check forbids external requests.');};
try{
 backend=createBackend({env:{},cwd:directory});
 const call=(path,method='GET',body)=>callHandler(backend.handler,{path,method,body});
 const health=await call('/api/health');assert.equal(health.status,200);
 assert.equal(health.body.services.community,'unconfigured');assert.equal(health.body.services.photos,'unconfigured');
 assert.equal((await call('/api/account/me')).body.configured,false);
 assert.equal((await call('/api/community/posts')).status,401);
 assert.equal((await call('/api/research/me')).status,401);
 const image={mimeType:'image/jpeg',base64:(await readFile(new URL('../tests/fixtures/cotton-illustration.jpg',import.meta.url))).toString('base64')};
 const demo=await call('/api/analyze','POST',{mode:'demo',image});assert.equal(demo.status,401);assert.equal(demo.body.error.code,'ACCOUNT_AUTH');
 const live=await call('/api/analyze','POST',{mode:'live',consent:true,image});assert.equal(live.status,401);assert.equal(live.body.error.code,'ACCOUNT_AUTH');
 assert.equal(networkRequests,0);
 console.log(JSON.stringify({passed:true,networkRequests,checks:['health','account configuration','signed-out community denied','signed-out photo service denied','signed-out demo denied','signed-out AI denied']}));
}finally{globalThis.fetch=originalFetch;backend?.close();await rm(directory,{recursive:true,force:true});}
