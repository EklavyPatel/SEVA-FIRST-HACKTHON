import {createHash,randomUUID} from 'node:crypto';
import {ApiError} from './errors.js';
import {boundedText,PARTS,csvCell} from './research-store.js';
import {normalizeFieldContext} from './research-context.js';
import {accountConfiguration} from './account-config.js';
import {researchConfiguration} from './research-readiness.js';
export const PHOTO_BUCKET='km-crop-photos';
export const PHOTO_CONSENT_VERSION='cotton-photo-v2';
export const IMAGE_LINK_SECONDS=60;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash=value=>createHash('sha256').update(value).digest('hex');
const unavailable=()=>new ApiError(503,'RESEARCH_SAVE_FAILED','The photo could not be saved to Supabase. Your crop guidance remains available. Please try saving again later.');
const missing=()=>new ApiError(404,'RESEARCH_NOT_FOUND','This research photo is unavailable.');
export function photoDetails(input={}) {
 const district=boundedText(input?.district,80),symptoms=boundedText(input?.symptoms,1000),plantPart=input?.plantPart||'unknown';
 if(!PARTS.includes(plantPart))throw new ApiError(400,'RESEARCH_INPUT','Choose the affected plant part.');
 return {district,symptoms,plantPart,fieldContext:normalizeFieldContext(input?.fieldContext)};
}
// Default researcher projection excludes ALL farmer free text, contact/identity,
// village, subdistrict and coordinates. Structured crop context remains useful.
export function researchDetails(details) {
 const allowed=['cropAgeDays','growthStage','symptomDays','spread','affectedPercent','irrigation','previousSeason'];
 return {plantPart:details.plantPart,district:'',symptoms:'',fieldContext:Object.fromEntries(allowed.filter(k=>details.fieldContext[k]!==undefined).map(k=>[k,details.fieldContext[k]]))};
}
export function createSupabasePhotoStore({url,publicKey,serviceKey,fetchImpl=fetch,outbox,publicAccess=false}={}) {
 publicAccess=false; // Approved accounts are always required, including with legacy environment flags.
 const configuration=accountConfiguration({url,publicKey});
 if(!researchConfiguration({url,publicKey,serviceKey}).configured||!outbox)return null;
 serviceKey=serviceKey.trim();
 let elevated=serviceKey.startsWith('sb_secret_');
 if(!elevated){try{elevated=JSON.parse(Buffer.from(serviceKey.split('.')[1],'base64url')).role==='service_role';}catch{}}
 if(!elevated)throw new Error('Photo storage requires a backend-only Supabase secret/service-role key.');
 url=configuration.url;publicKey=configuration.publicKey;
 const consentVersion=PHOTO_CONSENT_VERSION;
 const pending=new Map();
 async function remote(path,{method='GET',body,token,binary=false,allowConflict=false,expectDenied=false}={}) {
  let response;
  try{response=await fetchImpl(url+path,{method,redirect:'error',signal:AbortSignal.timeout(12_000),headers:{apikey:token?publicKey:serviceKey,...(token?{Authorization:`Bearer ${token}`}:(serviceKey.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${serviceKey}`})),...(binary?{'Content-Type':'image/jpeg','x-upsert':'false','Cache-Control':'no-store'}:body!==undefined?{'Content-Type':'application/json'}:{}),...(path.startsWith('/rest/')?{Prefer:'return=representation'}:{})},...(body!==undefined?{body:binary?body:JSON.stringify(body)}:{})});}catch(error){const code=error?.cause?.code||error?.code;const safeCode=['EAI_AGAIN','ENOTFOUND','ECONNREFUSED','ECONNRESET','ENETUNREACH'].includes(code)?code:null;throw new ApiError(503,'RESEARCH_NETWORK','The backend could not reach Supabase photo storage. Your crop guidance remains available.',{networkCode:safeCode});}
  let data;try{data=response.status===204?null:await response.json();}catch{throw unavailable();}
  if(!response.ok){if(expectDenied&&[401,403].includes(response.status)&&data?.code==='42501')return {expectedDenial:true};if(allowConflict&&response.status===409)return {conflict:true};if([401,403].includes(response.status)&&token)throw new ApiError(response.status,'RESEARCH_AUTH','Approved researcher access is required.');
   if(['PGRST205','PGRST202','42P01','42703','42883'].includes(data?.code))throw new ApiError(503,'RESEARCH_SCHEMA','Research database setup is incomplete. The photo migration must be applied by the project owner.');
   if(response.status===401||response.status===403)throw new ApiError(503,'RESEARCH_STORAGE_KEY','Supabase rejected the backend photo-storage credential.');throw unavailable();}
  return data;
 }
 const table='/rest/v1/km_photo_submissions';
 async function rows(query,token){const result=await remote(table+'?'+query,{token});if(!Array.isArray(result))throw unavailable();return result;}
 async function ownRow(id,owner,accessToken){if(!owner)throw missing();const row=(await rows(`id=eq.${id}&owner_key=eq.${encodeURIComponent(owner)}&limit=1`,accessToken))[0];if(!row||row.status!=='ready')throw missing();return row;}
 function dto(row,{privateFields=false}={}) {
  const details=privateFields?row.details:row.research_details;
  const reviews=row.annotations||[];const last=reviews.at(-1)||{};
  return {id:row.id,createdAt:row.created_at,...details,width:row.width,height:row.height,byteSize:row.byte_size,
   consentVersion:row.consent_version,researchConsent:row.research_consent,publicResearchConsent:row.public_research_consent===true,retentionConsent:row.retention_consent,
   analysisStatus:row.ai_status,aiResult:row.ai_result,aiModel:row.ai_model,aiVersion:row.ai_version,
   aiLabelKind:row.ai_result?'ai_suggestion':null,humanLabelKind:reviews.length?(last.expertConfirmed?'expert_confirmed':'human_annotation'):null,expertConfirmed:last.expertConfirmed===true,status:reviews.length?'reviewed':'unreviewed',reviewId:last.id??null,
   outcome:last.outcome,label:last.label,notes:last.notes,reviewer:last.reviewer,institution:last.institution,reviewedAt:last.createdAt,
   reviews,imageUrl:`/api/research/photos/${row.id}/image`};
 }
 async function researchRows(staff,id=null){if(!staff?.accessToken)throw new ApiError(403,'RESEARCH_AUTH','Approved researcher access is required.');const data=await remote('/rest/v1/rpc/km_research_photo_records',{method:'POST',body:{photo_id:id},token:staff.accessToken});if(!Array.isArray(data))throw unavailable();return data;}
 async function annotations(id){const data=await remote(`/rest/v1/km_photo_annotations?photo_id=eq.${id}&order=id.asc`);if(!Array.isArray(data))throw unavailable();return data.map(r=>({id:r.id,outcome:r.outcome,label:r.label,notes:r.notes,reviewer:'Approved '+r.reviewer_role,institution:'Account approved by project administrator',createdAt:r.created_at,labelKind:'human_annotation',expertConfirmed:r.expert_confirmed===true}));}
 async function accessRow(id,{owner,staff,accessToken}={}) {
  if(owner){const row=(await rows(`id=eq.${id}&owner_key=eq.${encodeURIComponent(owner)}&limit=1`,accessToken))[0];if(row?.status==='ready')return {row,privateFields:true};}
  const result=staff?await researchRows(staff,id):[];if(!result[0])throw missing();
  // Check current consent again before using an elevated credential to sign.
  const row=(await rows(`id=eq.${id}&status=eq.ready&research_consent=eq.true&retention_consent=eq.true&research_withdrawn_at=is.null&limit=1`))[0];if(!row)throw missing();
  return {row:result[0],objectPath:row.object_path,privateFields:false};
 }
 async function removeObject(path){await remote(`/storage/v1/object/${PHOTO_BUCKET}`,{method:'DELETE',body:{prefixes:[path]}});}
 async function cleanup(id,path){try{await removeObject(path);outbox.remove(id);return true;}catch{return false;}}
 async function existing(owner,requestKey,digest,accessToken){const row=(await rows(`owner_key=eq.${encodeURIComponent(owner)}&request_key=eq.${requestKey}&limit=1`,accessToken))[0];if(!row)return null;if(row.payload_hash!==digest||row.status!=='ready')throw new ApiError(409,'RESEARCH_DUPLICATE','This submission changed or was withdrawn. Start a new contribution.');return {photo:dto({...row,annotations:await annotations(row.id)},{privateFields:true}),duplicate:true};}
 return {
  kind:'supabase',consentVersion,publicAccess,
  async checkSetup(){
   const checks={};
   await Promise.all([
    ['submissions',()=>rows('select=id,owner_key,object_path,status,retention_consent,research_consent,ai_status,ai_result,ai_model,ai_version&limit=0')],
    ['approval_schema',()=>remote('/rest/v1/km_access_requests?select=id,applicant_name,intended_use,revision,review_reason&limit=0')],
    ['approval_history',()=>remote('/rest/v1/km_access_request_history?select=id,request_id,revision,event,reason,reviewer_user_id&limit=0')],
    ['owner_withdraw_rpc',async()=>{const result=await remote('/rest/v1/rpc/km_withdraw_own_photo',{method:'POST',body:{submission_id:'00000000-0000-0000-0000-000000000000',remove_retention:false},expectDenied:true});if(result?.expectedDenial!==true)throw new ApiError(503,'RESEARCH_RPC','Owner withdrawal enforcement did not pass its readiness check.');}],
    ['annotations',()=>remote('/rest/v1/km_photo_annotations?select=id,photo_id,reviewer_role,expert_confirmed&limit=0')],
    ['staff_rpc',async()=>{const result=await remote('/rest/v1/rpc/km_research_photo_records',{method:'POST',body:{photo_id:null},expectDenied:true});if(result?.expectedDenial!==true)throw new ApiError(503,'RESEARCH_RPC','Research access enforcement did not pass its readiness check.');}],
    ['bucket',async()=>{const bucket=await remote('/storage/v1/bucket/'+PHOTO_BUCKET);if(bucket.id!==PHOTO_BUCKET||bucket.public!==false||Number(bucket.file_size_limit)!==3145728||!Array.isArray(bucket.allowed_mime_types)||bucket.allowed_mime_types.length!==1||bucket.allowed_mime_types[0]!=='image/jpeg')throw new ApiError(503,'RESEARCH_BUCKET','Private JPEG-only photo bucket restrictions are missing.');}],
   ].map(async([name,check])=>{try{await check();checks[name]={outcome:'pass'};}catch(error){checks[name]={outcome:'failure',reason:['RESEARCH_SCHEMA','RESEARCH_STORAGE_KEY','RESEARCH_BUCKET','RESEARCH_RPC','RESEARCH_NETWORK'].includes(error.code)?error.code:'provider_unavailable'};}}));
   return checks;
  },
  owner(account){return account?'u:'+account.user.id:null;},
  async stats(owner,accessToken){return {count:owner?(await rows(`owner_key=eq.${encodeURIComponent(owner)}&status=eq.ready&select=id&limit=31`,accessToken)).length:0,maximumContributions:30};},
  async save({owner,userId=null,accessToken,requestKey,image,details,consent,analysis=null}) {
   if(!accessToken||!uuid.test(userId||'')||owner!=='u:'+userId)throw new ApiError(401,'ACCOUNT_AUTH','A verified account is required to save photos.');
   if(consent?.retention!==true||consent?.version!==consentVersion||typeof consent?.accepted!=='boolean')throw new ApiError(400,'RESEARCH_CONSENT','Separate photo retention and researcher sharing choices are required.');
   if(!owner||!uuid.test(requestKey||''))throw new ApiError(400,'RESEARCH_INPUT','Please check the submission key.');
   details=photoDetails(details);
   const digest=hash(Buffer.concat([image.data,Buffer.from(JSON.stringify({details,consent:{retention:true,research:consent.accepted,version:consentVersion},analysis}))]));
   const lock=owner+':'+requestKey;
   if(pending.has(lock))throw new ApiError(409,'RESEARCH_PENDING','This photo is already being saved. Wait, then check My contributions before retrying.');
   pending.set(lock,true);
   try{
    const prior=await existing(owner,requestKey,digest,accessToken);if(prior)return prior;
    if((await this.stats(owner,accessToken)).count>=30)throw new ApiError(429,'RESEARCH_LIMIT','Your contribution limit has been reached.');
    const id=randomUUID(),objectPath=randomUUID()+'/'+id+'.jpg';
    const row={id,owner_key:owner,owner_user_id:userId,request_key:requestKey,payload_hash:digest,bucket:PHOTO_BUCKET,object_path:objectPath,
     status:'ready',width:image.width,height:image.height,byte_size:image.data.length,details,research_details:researchDetails(details),
     retention_consent:true,research_consent:consent.accepted,public_research_consent:false,consent_version:consentVersion,
     ai_status:analysis?'completed':'not_attached',ai_result:analysis?.result??null,ai_model:analysis?.model??null,ai_version:analysis?.version??null};
    // Journal precedes upload, so crash/cleanup failures remain discoverable.
    try{outbox.add(id,objectPath);}catch{throw unavailable();}
    try{
     await remote(`/storage/v1/object/${PHOTO_BUCKET}/${objectPath}`,{method:'POST',binary:true,body:image.data});
     const result=await remote(table,{method:'POST',body:row,allowConflict:true});
     if(result?.conflict){await cleanup(id,objectPath);const duplicate=await existing(owner,requestKey,digest,accessToken);if(duplicate)return duplicate;throw unavailable();}
     if(!Array.isArray(result)||result[0]?.id!==id)throw unavailable();
     try{outbox.remove(id);}catch{/* Reconciler sees committed record and retains the file. */}
     return {photo:dto({...result[0],annotations:[]},{privateFields:true}),duplicate:false};
    }catch(error){
     // A response can be lost after commit. Never delete a committed photo.
     try{const committed=await existing(owner,requestKey,digest,accessToken);if(committed?.photo.id===id){try{outbox.remove(id);}catch{}return committed;}}catch{/* Reconciliation handles uncertain database outcomes. */}
     // Check this particular path before cleanup, including concurrent requests.
     try{const committed=await rows(`object_path=eq.${encodeURIComponent(objectPath)}&select=id&limit=1`);if(!committed.length)await cleanup(id,objectPath);}catch{/* Keep journal for later reconciliation; never guess on a database outage. */}
     throw error instanceof ApiError?error:unavailable();
    }
   }finally{pending.delete(lock);}
  },
  async list({owner,staff,accessToken,q='',status='all',part='all',offset=0,limit=12}={}) {
   const data=owner!==undefined?(owner?await rows(`owner_key=eq.${encodeURIComponent(owner)}&status=eq.ready&order=created_at.desc&limit=31`,accessToken):[]):await researchRows(staff);
   const items=[];for(const row of data){const photo=dto({...row,annotations:row.annotations??await annotations(row.id)},{privateFields:owner!==undefined});if(part!=='all'&&photo.plantPart!==part||status!=='all'&&photo.status!==status)continue;if(q&&!JSON.stringify({details:photo.fieldContext,label:photo.label,district:photo.district,symptoms:photo.symptoms}).toLowerCase().includes(q.toLowerCase()))continue;items.push(photo);}
   return {items:items.slice(offset,offset+limit),total:items.length,offset,limit};
  },
  async photo(id,access){const{row,privateFields}=await accessRow(id,access);return dto({...row,annotations:row.annotations??await annotations(id)},{privateFields});},
  async imageLink(id,access){const{row,objectPath}=await accessRow(id,access);const path=objectPath||row.object_path;const signed=await remote(`/storage/v1/object/sign/${PHOTO_BUCKET}/${path}`,{method:'POST',body:{expiresIn:IMAGE_LINK_SECONDS}});let signedUrl;try{signedUrl=new URL(signed.signedURL.startsWith('/object/')?'/storage/v1'+signed.signedURL:signed.signedURL,url);if(signedUrl.origin!==url||!signedUrl.pathname.startsWith(`/storage/v1/object/sign/${PHOTO_BUCKET}/`))throw Error();}catch{throw unavailable();}return {url:signedUrl.href,expiresIn:IMAGE_LINK_SECONDS};},
  async image(id,access){const link=await this.imageLink(id,access);try{const r=await fetchImpl(link.url,{redirect:'error',signal:AbortSignal.timeout(12_000)});if(!r.ok)throw Error();const data=Buffer.from(await r.arrayBuffer());if(data.length>3*1024*1024)throw Error();return data;}catch{throw unavailable();}},
  async revoke(id,owner,{remove=false,accessToken}={}) {
   const row=await ownRow(id,owner,accessToken);
   if(remove)outbox.add(id,row.object_path);
   await remote('/rest/v1/rpc/km_withdraw_own_photo',{method:'POST',token:accessToken,body:{submission_id:id,remove_retention:remove}});
   let cleanupPending=false;if(remove){cleanupPending=!await cleanup(id,row.object_path);}
   return {withdrawn:true,retentionWithdrawn:remove,cleanupPending,issuedLinkMaxSeconds:IMAGE_LINK_SECONDS};
  },
  async review(id,staff,input) {
   if(!staff?.accessToken)throw new ApiError(401,'RESEARCH_AUTH','Approved account required.');
   if(!['labeled','inconclusive','unsuitable'].includes(input?.outcome))throw new ApiError(400,'RESEARCH_INPUT','Choose a review outcome.');
   const label=boundedText(input.label,150,input.outcome==='labeled'),notes=boundedText(input.notes,2000,true);
   if(input.expectedReviewId!==null&&!Number.isSafeInteger(input.expectedReviewId))throw new ApiError(400,'RESEARCH_INPUT','Reopen this photo before reviewing.');
   const result=await remote('/rest/v1/rpc/km_add_photo_annotation',{method:'POST',token:staff.accessToken,body:{submission_id:id,expected_review_id:input.expectedReviewId,review_outcome:input.outcome,review_label:label,review_notes:notes}});
   if(result?.conflict)throw new ApiError(409,'RESEARCH_CONFLICT','Another review was saved. Reopen this photo.');
   return this.photo(id,{staff});
  },
  async exportCsv(staff){const data=await this.list({staff,limit:Number.MAX_SAFE_INTEGER});const fields=['id','createdAt','plantPart','analysisStatus','aiLabelKind','aiModel','humanLabelKind','expertConfirmed','status','outcome','label','notes','reviewer'];return '\ufeff'+[fields.map(csvCell).join(','),...data.items.map(row=>fields.map(key=>csvCell(row[key])).join(','))].join('\r\n');},
  async reconcile({minimumAge=15*60_000}={}) {const report={retained:0,deleted:0,pending:0};for(const entry of outbox.entries()){if(Date.now()-entry.createdAt<minimumAge)continue;try{const found=await rows(`object_path=eq.${encodeURIComponent(entry.objectPath)}&status=eq.ready&select=id&limit=1`);if(found.length){outbox.remove(entry.id);report.retained++;}else if(await cleanup(entry.id,entry.objectPath))report.deleted++;else report.pending++;}catch{report.pending++;}}return report;},
 };
}
