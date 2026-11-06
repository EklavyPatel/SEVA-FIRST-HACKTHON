// Explicit mocked confirmed account for AI/domain regression tests. Production
// createApp has no authentication bypass. Authorization tests use it directly.
import {createApp} from '../../server/app.js';
import {callHandler} from '../http.js';
export const fixtureUserId='90000000-0000-4000-8000-000000000001';
export function createAuthenticatedApp(options={}) {
 const provider=async(raw,init)=>{
  const url=new URL(raw),name=JSON.parse(init.body||'{}').email?.split('@')[0];
  const token=init.headers.Authorization?.slice(7);
  if(url.pathname==='/auth/v1/token')return Response.json({access_token:name||'a',expires_in:3600,user:{email_confirmed_at:'2026-01-01'}});
  if(url.pathname==='/auth/v1/user')return Response.json({id:token==='b'?'90000000-0000-4000-8000-000000000002':fixtureUserId,email:'fixture@example.invalid',email_confirmed_at:'2026-01-01'});
  if(url.pathname==='/rest/v1/km_account_roles')return Response.json(token==='staff'?[{role:'researcher'}]:[]);
  if(['/rest/v1/km_access_requests','/rest/v1/km_access_request_history'].includes(url.pathname))return Response.json([]);
  if(url.pathname==='/auth/v1/logout')return Response.json({});
  throw new Error('Unexpected mocked auth path');
 };
 const app=createApp({supabaseUrl:'https://fixture.supabase.co',supabasePublicKey:'sb_publishable_fixture_only',accountFetchImpl:provider,communityStorage:'sqlite',...options});
 let session;
 const login=async name=>{const result=await callHandler(app,{path:'/api/account/login',body:{email:name+'@example.invalid',password:'fixture-password'}});if(result.status!==200)throw Error('Mock account login failed');return result.headers['set-cookie'].split(';')[0];};
 const handler=async(req,res)=>{
  if(!req.url.startsWith('/api/account/')&&!req.headers.cookie?.includes('km_account=')){
   session ||= login('a');req.headers.cookie=(req.headers.cookie?req.headers.cookie+'; ':'')+await session;
  }
  return app(req,res);
 };
 handler.login=login;return handler;
}
