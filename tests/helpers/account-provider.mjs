// HTTP contract fixture only. It does not execute PostgreSQL/RLS.
export function accountProvider() {
 const ids={a:'20000000-0000-4000-8000-000000000001',b:'20000000-0000-4000-8000-000000000002',admin:'20000000-0000-4000-8000-000000000003'};
 const roles={admin:'admin'},requests=[],history=[],calls=[];let expired=false,confirmed=true;
 const reply=(value,status=200)=>Response.json(value,{status});
 const fetchImpl=async(raw,options={})=>{
  const url=new URL(raw),path=url.pathname,body=options.body?JSON.parse(options.body):undefined,token=options.headers?.Authorization?.slice(7),userId=ids[token];calls.push({url,options,body});
  if(path==='/auth/v1/token')return reply({access_token:body.email.split('@')[0],expires_in:3600,user:{email_confirmed_at:confirmed?'2026-01-01':null}});
  if(path==='/auth/v1/user')return expired?reply({code:'session_expired'},401):reply({id:userId||ids.a,email:(token||'a')+'@example.invalid',email_confirmed_at:confirmed?'2026-01-01':null});
  if(['/auth/v1/signup','/auth/v1/logout','/auth/v1/recover'].includes(path))return reply({});
  if(path==='/auth/v1/verify')return body.token_hash==='x'.repeat(64)?reply({code:'otp_expired'},403):reply({access_token:'a'});
  if(!userId)return reply({code:'42501'},403);
  if(path==='/rest/v1/km_account_roles')return reply(roles[token]?[{role:roles[token]}]:[]);
  if(path==='/rest/v1/km_access_requests'){
   const own=url.searchParams.get('user_id');const status=url.searchParams.get('status');
   return reply(structuredClone(requests.filter(r=>(own?r.user_id===own.slice(3):roles[token]==='admin'||r.user_id===userId)&&(!status||status==='eq.'+r.status||status==='neq.pending'&&r.status!=='pending'))));
  }
  if(path==='/rest/v1/km_access_request_history')return reply(structuredClone(history.filter(h=>roles[token]==='admin'||h.user_id===userId)));
  if(path==='/rest/v1/rpc/km_submit_access_request'){
   let r=requests.find(r=>r.user_id===userId);if(r&&['pending','approved'].includes(r.status))return reply({code:'23505'},409);
   const next={id:r?.id||crypto.randomUUID(),user_id:userId,kind:body.applicant_kind,applicant_name:body.applicant_name,institution:body.applicant_institution,purpose:body.applicant_purpose,intended_use:body.applicant_intended_use,status:'pending',revision:(r?.revision||0)+1,review_reason:'',reviewed_by:null,reviewed_at:null,created_at:r?.created_at||new Date().toISOString()};
   if(r)Object.assign(r,next);else{r=next;requests.push(r);}history.push({...r,id:history.length+1,request_id:r.id,event:'submitted'});return reply({id:r.id});
  }
  if(path==='/rest/v1/rpc/km_review_access_request'){
   const r=requests.find(r=>r.id===body.request_id);
   if(roles[token]!=='admin'||r?.user_id===userId)return reply({code:'42501'},403);
   if(!r||r.revision!==body.expected_revision)return reply({code:'KM409'},409);
   if(r.status===body.decision&&r.reviewed_by===userId&&r.review_reason===body.review_reason)return reply({alreadyApplied:true});
   if(!(r.status==='pending'&&['approved','rejected'].includes(body.decision)||r.status==='approved'&&body.decision==='revoked'))return reply({code:'KM409'},409);
   Object.assign(r,{status:body.decision,reviewed_by:userId,review_reason:body.review_reason,reviewed_at:new Date().toISOString()});
   const applicant=Object.keys(ids).find(k=>ids[k]===r.user_id);if(body.decision==='approved')roles[applicant]='researcher';if(body.decision==='revoked')delete roles[applicant];
   history.push({...r,id:history.length+1,request_id:r.id,event:r.status,reason:r.review_reason,reviewer_user_id:userId});return reply({reviewed:true});
  }
  throw new Error('Unexpected account fixture URL');
 };
 return {ids,roles,requests,history,calls,fetchImpl,expire(){expired=true;},unconfirm(){confirmed=false;}};
}
