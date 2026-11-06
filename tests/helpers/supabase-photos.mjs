// HTTP contract fixture. No network calls and no real credentials.
export function photoProvider() {
 const rows=[],annotations=[],objects=new Map(),calls=[];
 const ids={a:'10000000-0000-4000-8000-000000000001',b:'10000000-0000-4000-8000-000000000002',researcher:'10000000-0000-4000-8000-000000000003',expert:'10000000-0000-4000-8000-000000000004',admin:'10000000-0000-4000-8000-000000000005'};
 const roles={researcher:'researcher',expert:'expert',admin:'admin'};
 const state={failDatabase:false,failUpload:false,failCleanup:false,lostCommit:false,waitUpload:null};
 const clone=value=>structuredClone(value);
 const response=(value,status=200)=>Response.json(value,{status});
 function matches(row,url){for(const[k,v]of url.searchParams){if(v.startsWith('eq.')&&String(row[k])!==v.slice(3))return false;}return true;}
 const fetchImpl=async(raw,init={})=>{
  const url=new URL(raw),path=url.pathname,method=init.method||'GET',headers=init.headers||{};
  const token=headers.Authorization?.replace('Bearer ','');
  const body=typeof init.body==='string'?JSON.parse(init.body):init.body;
  calls.push({path,method,headers,body});
  if(path==='/auth/v1/token'){const key=body.email.split('@')[0];return response({access_token:key,expires_in:3600,user:{email_confirmed_at:'2026-01-01'}});}
  if(path==='/auth/v1/user')return response({id:ids[token],email_confirmed_at:'2026-01-01'});
  if(path==='/rest/v1/km_account_roles')return response(roles[token]?[{role:roles[token]}]:[]);
  if(['/rest/v1/rpc/km_research_photo_records','/rest/v1/rpc/km_public_research_photo_records'].includes(path)){
   const publicQuery=path.endsWith('/km_public_research_photo_records');
   if(publicQuery&&headers.apikey!=='sb_secret_fixture_photos')return response({code:'42501'},403);
   if(!publicQuery&&!roles[token])return response({code:'42501'},403);
   return response(rows.filter(r=>(!publicQuery||(r.public_research_consent&&r.consent_version==='cotton-photo-public-v1'))&&r.status==='ready'&&r.retention_consent&&r.research_consent&&!r.research_withdrawn_at&&(!body.photo_id||body.photo_id===r.id)).map(r=>{
    const {owner_key,owner_user_id,object_path,payload_hash,details,request_key,...safe}=r;
    safe.annotations=annotations.filter(a=>a.photo_id===r.id).map(a=>({id:a.id,label:a.label,notes:a.notes,outcome:a.outcome,expertConfirmed:a.expert_confirmed,labelKind:'human_annotation',reviewer:'Approved '+a.reviewer_role,institution:'Approved',createdAt:a.created_at}));return clone(safe);
   }));
  }
  if(path==='/rest/v1/rpc/km_add_photo_annotation'){
   const row=rows.find(r=>r.id===body.submission_id&&r.status==='ready'&&r.research_consent);
   if(!roles[token]||!row)return response({code:'42501'},403);
   const prior=annotations.filter(a=>a.photo_id===row.id).at(-1);
   if((prior?.id??null)!==body.expected_review_id)return response({conflict:true});
   annotations.push({id:annotations.length+1,photo_id:row.id,reviewer_role:roles[token],outcome:body.review_outcome,label:body.review_label,notes:body.review_notes,expert_confirmed:roles[token]==='expert'&&body.review_outcome==='labeled',created_at:new Date().toISOString()});
   return response({saved:true});
  }
  if(path==='/rest/v1/rpc/km_withdraw_own_photo'){
   const row=rows.find(r=>r.id===body.submission_id&&r.owner_user_id===ids[token]&&r.status==='ready');
   if(!row)return response({code:'42501'},403);
   Object.assign(row,{research_consent:false,public_research_consent:false,research_withdrawn_at:new Date().toISOString(),...(body.remove_retention?{retention_consent:false,status:'withdrawn',details:{},research_details:{},ai_status:'not_attached',ai_result:null,ai_model:null,ai_version:null}:{})});return response({withdrawn:true});
  }
  if(path==='/rest/v1/km_photo_submissions'&&method==='GET'&&ids[token])return response(clone(rows.filter(r=>r.owner_user_id===ids[token]&&matches(r,url))));
  if(path.startsWith('/storage/v1/object/sign/')){
   const object=path.slice('/storage/v1/object/sign/km-crop-photos/'.length);
   if(method==='POST')return response({signedURL:'/object/sign/km-crop-photos/'+object+'?token=fixture'});
   return objects.has(object)?new Response(objects.get(object),{headers:{'Content-Type':'image/jpeg'}}):response({},404);
  }
  if(headers.apikey!=='sb_secret_fixture_photos')return response({code:'42501'},403);
  if(path==='/storage/v1/bucket/km-crop-photos')return response({id:'km-crop-photos',public:false,file_size_limit:3145728,allowed_mime_types:['image/jpeg']});
  if(path==='/rest/v1/km_photo_submissions'){
   if(method==='POST'){
    if(state.failDatabase)return response({message:'PRIVATE DATABASE DETAIL'},500);
    if(rows.some(r=>r.owner_key===body.owner_key&&r.request_key===body.request_key))return response({},409);
    const row={...clone(body),created_at:new Date().toISOString()};rows.push(row);
    if(state.lostCommit){state.lostCommit=false;throw Error('Lost response');}
    return response([clone(row)],201);
   }
   if(method==='PATCH'){const found=rows.filter(r=>matches(r,url));for(const row of found)Object.assign(row,clone(body));return response(clone(found));}
   return response(clone(rows.filter(r=>matches(r,url))));
  }
  if(['/rest/v1/km_access_requests','/rest/v1/km_access_request_history'].includes(path))return response([]);
  if(path==='/rest/v1/km_photo_annotations')return response(clone(annotations.filter(r=>matches(r,url))));
  if(path==='/storage/v1/object/km-crop-photos'&&method==='DELETE'){
   if(state.failCleanup)return response({},500);for(const name of body.prefixes)objects.delete(name);return response([]);
  }
  if(path.startsWith('/storage/v1/object/km-crop-photos/')&&method==='POST'){
   if(state.waitUpload)await state.waitUpload;
   if(state.failUpload)return response({},500);
   const name=path.slice('/storage/v1/object/km-crop-photos/'.length);
   if(objects.has(name))return response({},409);
   objects.set(name,Buffer.from(body));return response({Key:name});
  }
  throw Error('Unexpected fixture route');
 };
 return {fetchImpl,rows,annotations,objects,calls,roles,state,ids};
}
