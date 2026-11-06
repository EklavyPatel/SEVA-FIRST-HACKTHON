import test from 'node:test';
import assert from 'node:assert/strict';
import { probeAnonymousDatabase } from '../scripts/backend-probe.mjs';
const options = {url:'https://fixture.supabase.co', publicKey:'sb_publishable_fixture'};
test('checker sends no bearer token and classifies anonymous 42501 as expected', async () => {
 const rows = await probeAnonymousDatabase({...options, fetchImpl:async (url, init) => {
  assert.deepEqual(init.headers, {apikey:options.publicKey});
  assert.equal(new URL(url).searchParams.get('limit'),'0');
  return Response.json({code:'42501',message:'PRIVATE'}, {status:401});
 }});
 for (const row of Object.values(rows)) assert.deepEqual(row,{role:'anon',status:401,code:'42501',outcome:'expected_denial'});
 assert.ok(!JSON.stringify(rows).includes('PRIVATE'));
});
test('checker separates missing schema, rejected key, network failure and anonymous exposure', async () => {
 for (const [status,body,outcome] of [[404,{code:'PGRST205'},'failure'],[401,{},'failure'],[403,{code:'42501'},'expected_denial'],[200,[],'unexpected_anonymous_access']]) {
  const rows=await probeAnonymousDatabase({...options,fetchImpl:async()=>Response.json(body,{status})});
  assert.ok(Object.values(rows).every(row=>row.outcome===outcome));
 }
 const rows=await probeAnonymousDatabase({...options,fetchImpl:async()=>{throw Error('PRIVATE');}});
 assert.ok(Object.values(rows).every(row=>row.outcome==='failure'));
 assert.ok(!JSON.stringify(rows).includes('PRIVATE'));
});
