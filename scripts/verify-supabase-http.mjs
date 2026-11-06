// Creates disposable Auth fixtures through generate_link (no emails are sent),
// exercises real Auth/PostgREST, then deletes the fixtures in a finally block.
export async function verifySupabaseHttp({url,publicKey,serviceKey,fixtureId,fixturePassword,appOrigin='http://127.0.0.1:5173',fetchImpl=fetch}) {
 const checks=[],users=[];
 const assert=(ok,message)=>{if(!ok)throw new Error(message);};
 async function request(path,{method='GET',body,token,admin=false}={}){
  const key=admin?serviceKey:publicKey;
  const response=await fetchImpl(url+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{apikey:key,...(admin&&!key.startsWith('sb_secret_')?{Authorization:'Bearer '+key}:token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  let data;try{data=await response.json();}catch{data=null;}
  return {ok:response.ok,status:response.status,data};
 }
 async function rpc(token,action,post_id=null,input={}){
  return request('/rest/v1/rpc/km_community',{method:'POST',token,body:{action,post_id,input,search_query:''}});
 }
 const report={checks,emailsSent:0,fixturesDeleted:false};
 try{
  const settings=await request('/auth/v1/settings');
  assert(settings.ok&&settings.data.external?.email&&!settings.data.disable_signup&&!settings.data.mailer_autoconfirm,'Email signup/confirmation settings are incorrect.');
  checks.push('email/password enabled; confirmation required');
  for(const label of ['a','b']){
   const email=`km-check-${fixtureId}-${label}@example.invalid`;
   const expectedRedirect=new URL('/#/login',appOrigin).href;
   const generated=await request('/auth/v1/admin/generate_link?redirect_to='+encodeURIComponent(expectedRedirect),{method:'POST',admin:true,body:{type:'signup',email,password:fixturePassword}});
   const id=generated.data?.user?.id||generated.data?.id;
   if(id)users.push(id);
   assert(generated.ok&&id&&generated.data.hashed_token,'Unable to create disposable Auth fixture (HTTP '+generated.status+').');
   report.confirmationRedirect={expected:expectedRedirect,actual:generated.data.redirect_to,allowed:generated.data.redirect_to===expectedRedirect};
   const before=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password:fixturePassword}});
   assert(!before.ok&&(before.data?.error_code||before.data?.code)==='email_not_confirmed','Unconfirmed fixture unexpectedly signed in.');
   const verified=await request('/auth/v1/verify',{method:'POST',body:{token_hash:generated.data.hashed_token,type:'email'}});
   assert(verified.ok&&verified.data?.access_token,'Confirmation token verification failed.');
   await request('/auth/v1/logout?scope=local',{method:'POST',token:verified.data.access_token});
   const login=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password:fixturePassword}});
   assert(login.ok&&login.data?.user?.id===id&&login.data?.access_token,'Confirmed fixture login failed.');
   const token=login.data.access_token;
   const identity=await request('/auth/v1/user',{token});
   assert(identity.ok&&identity.data?.id===id,'Signed-in identity verification failed.');
   const roles=await request('/rest/v1/km_account_roles?select=role',{token});
   assert(roles.ok&&Array.isArray(roles.data)&&roles.data.length===0,'New account received an elevated role.');
   users[users.indexOf(id)]={id,email,token};
  }
  checks.push('unconfirmed login denied; email token verified; real login and identity verified for two accounts');
  const [a,b]=users;
  const wrong=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:a.email,password:fixturePassword+'wrong'}});
  assert(!wrong.ok&&(wrong.data?.error_code||wrong.data?.code)==='invalid_credentials','Wrong password was not denied.');
  checks.push('wrong password denied; normal accounts have no staff roles');
  const application=await request('/rest/v1/rpc/km_submit_access_request',{method:'POST',token:a.token,body:{applicant_kind:'individual',applicant_name:'Disposable integration fixture',applicant_institution:'Integration check',applicant_purpose:'Synthetic access test',applicant_intended_use:'Synthetic access test'}});
  assert(application.ok&&application.data?.status==='pending','Research access submission failed.');
  const own=await request('/rest/v1/km_access_requests?select=id,status',{token:a.token});
  const other=await request('/rest/v1/km_access_requests?select=id,status',{token:b.token});
  const otherHistory=await request('/rest/v1/km_access_request_history?select=id',{token:b.token});
  assert(own.ok&&own.data?.length===1&&other.ok&&other.data?.length===0&&otherHistory.ok&&otherHistory.data?.length===0,'Research application isolation failed.');
  checks.push('research application saved; second account cannot read it or its history');
  const post=await rpc(a.token,'post',null,{title:'Disposable integration fixture',body:'Synthetic question, removed by this check.',alias:'Test farmer',shared:true,owner_user_id:b.id});
  assert(post.ok&&post.data?.post?.mine,'Community post failed.');
  const id=post.data.post.id;
  const reply=await rpc(b.token,'reply',id,{body:'Synthetic reply',alias:'Test neighbor',shared:true,staff:true});
  assert(reply.ok&&reply.data?.post?.mine===false&&reply.data.post.replies[0]?.staff===false,'Community ownership or staff spoof prevention failed.');
  assert(!JSON.stringify(reply.data).includes(a.id)&&!JSON.stringify(reply.data).includes(b.id),'Community leaked owner IDs.');
  const denial=await rpc(b.token,'delete',id);
  assert(!denial.ok&&denial.data?.code==='42501','Another account deleted the author’s post.');
  const resolved=await rpc(a.token,'status',id,{resolved:true});
  assert(resolved.ok&&resolved.data?.post?.resolved===true,'Author status update failed.');
  assert((await rpc(a.token,'delete',id)).data?.removed===true,'Author delete failed.');
  checks.push('community post/reply/status/delete; author isolation; staff spoof and owner-ID leak checks');
  const denied=await request('/rest/v1/rpc/km_research_photo_records',{method:'POST',token:b.token,body:{photo_id:null}});
  const photos=await request('/rest/v1/km_photo_submissions?select=id',{token:b.token});
  assert(!denied.ok&&denied.data?.code==='42501'&&photos.ok&&photos.data?.length===0,'Private photo/research isolation failed.');
  for(const table of ['km_account_roles','km_access_requests','km_access_request_history','km_community_posts','km_community_replies']){
   const response=await request('/rest/v1/'+table+'?select=*&limit=1');
   assert(!response.ok,'Anonymous table read was allowed: '+table);
  }
  checks.push('research denied before approval; private photos isolated; anonymous database reads denied');
  const expectedRecovery=new URL('/#/reset-password',appOrigin).href;
  const recovery=await request('/auth/v1/admin/generate_link?redirect_to='+encodeURIComponent(expectedRecovery),{method:'POST',admin:true,body:{type:'recovery',email:a.email}});
  assert(recovery.ok&&recovery.data?.hashed_token,'Recovery link generation failed.');
  report.recoveryRedirect={expected:expectedRecovery,actual:recovery.data.redirect_to,allowed:recovery.data.redirect_to===expectedRecovery};
  const recoverySession=await request('/auth/v1/verify',{method:'POST',body:{token_hash:recovery.data.hashed_token,type:'recovery'}});
  assert(recoverySession.ok&&recoverySession.data?.access_token,'Recovery token verification failed.');
  const newPassword=fixturePassword+'-reset';
  const changed=await request('/auth/v1/user',{method:'PUT',token:recoverySession.data.access_token,body:{password:newPassword}});
  assert(changed.ok,'Fixture password reset failed.');
  await request('/auth/v1/logout?scope=local',{method:'POST',token:recoverySession.data.access_token});
  const resetLogin=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:a.email,password:newPassword}});
  assert(resetLogin.ok&&resetLogin.data?.access_token,'Login after password reset failed.');
  const logout=await request('/auth/v1/logout?scope=local',{method:'POST',token:resetLogin.data.access_token});
  assert(logout.ok,'Provider logout failed.');
  checks.push('recovery token verified; password changed; login with new password; provider logout');
  report.passed=report.confirmationRedirect.allowed&&report.recoveryRedirect.allowed;
  if(!report.passed)report.failure='Add the expected callback URLs in Supabase Auth URL Configuration.';
 }catch(error){report.passed=false;report.failure=error.message;}
 finally{
  const failures=[];
  for(const user of users){
   const id=typeof user==='string'?user:user.id;
   try{if(!(await request('/auth/v1/admin/users/'+id,{method:'DELETE',admin:true})).ok)failures.push(id);}catch{failures.push(id);}
  }
  report.fixturesDeleted=failures.length===0;
  if(failures.length){report.passed=false;report.cleanupUserIds=failures;}
 }
 return report;
}

// CLI entry point. Fixture creation is opt-in; credentials are never printed.
if(typeof process!=='undefined'&&process.argv[1]&&import.meta.url===new URL(process.argv[1],'file:').href){
 if(!process.argv.includes('--fixtures'))throw new Error('Use --fixtures to create and delete disposable Auth fixtures without sending emails.');
 const {loadBackendEnvironment}=await import('../server/env.js');
 const {randomBytes}=await import('node:crypto');loadBackendEnvironment();
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_PUBLISHABLE_KEY||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Configure the private Supabase backend settings.');
 const report=await verifySupabaseHttp({url:process.env.SUPABASE_URL,publicKey:process.env.SUPABASE_PUBLISHABLE_KEY,serviceKey:process.env.SUPABASE_SERVICE_ROLE_KEY,appOrigin:process.env.APP_ORIGIN||'http://127.0.0.1:5173',fixtureId:randomBytes(8).toString('hex'),fixturePassword:randomBytes(24).toString('base64url')+'!9aA'});
 console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
}
