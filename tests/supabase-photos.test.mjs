import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
const sharp=(await import(createRequire(new URL('../server/package.json',import.meta.url)).resolve('sharp'))).default;
import {createApp} from '../server/app.js';
import {createSupabasePhotoStore,PHOTO_CONSENT_VERSION} from '../server/supabase-photos.js';
import {openPhotoOutbox} from '../server/photo-outbox.js';
import {photoProvider} from './helpers/supabase-photos.mjs';
import {callHandler} from './http.js';
import {sdkMock,sdkResponse} from './sdk-mock.js';
import {demoAnalysis} from '../server/demo.js';
const image={base64:(await readFile(new URL('./fixtures/cotton-illustration.jpg',import.meta.url))).toString('base64'),mimeType:'image/jpeg'};
function setup(options={}){
 const {publicAccess=false,...appOptions}=options;
 const provider=photoProvider();const jobs=new Map();const outbox={add(id,objectPath){jobs.set(id,{id,objectPath,createdAt:0});},remove(id){jobs.delete(id);},entries(){return [...jobs.values()];}};
 const store=createSupabasePhotoStore({url:'https://fixture.supabase.co',publicKey:'sb_publishable_fixture',serviceKey:'sb_secret_fixture_photos',fetchImpl:provider.fetchImpl,outbox,publicAccess});
 const app=createApp({apiKey:'fixture',supabaseUrl:'https://fixture.supabase.co',supabasePublicKey:'sb_publishable_fixture',accountFetchImpl:provider.fetchImpl,photoStore:store,...appOptions});
 const rawCall=(path,method='GET',body,cookie)=>callHandler(app,{path:'/api/research'+path,method,body,headers:cookie?{cookie}:{}});
 let defaultSession;
 const call=async(path,method='GET',body,cookie)=>{
  if(!cookie){defaultSession ||= login('a');cookie=await defaultSession;}
  const result=await rawCall(path,method,body,cookie);result.headers['set-cookie'] ||= cookie+'; HttpOnly';return result;
 };
 const payload=()=>({image,requestKey:randomUUID(),consent:{retention:true,accepted:true,version:PHOTO_CONSENT_VERSION},details:{plantPart:'leaf',district:'PRIVATE DISTRICT',symptoms:'PRIVATE CONTACT',fieldContext:{village:'PRIVATE VILLAGE',cropAgeDays:60,coordinates:{latitude:23.12345,longitude:72.12345},shareCoordinates:true}}});
 const login=async name=>{const r=await callHandler(app,{path:'/api/account/login',body:{email:name+'@example.invalid',password:'fixture-password'}});assert.equal(r.status,200);return r.headers['set-cookie'].split(';')[0];};
 return {...provider,store,jobs,call,rawCall,payload,login,app};
}
const ownerCookie=r=>r.headers['set-cookie']?.split(';')[0];
test('normal accounts may contribute without research approval; sharing remains optional and private',async()=>{
 const s=setup();
 assert.equal((await s.rawCall('/contributions','POST',s.payload())).status,401);
 for(const consent of [{retention:false,accepted:true,version:PHOTO_CONSENT_VERSION},{accepted:true,version:PHOTO_CONSENT_VERSION},{retention:true,version:PHOTO_CONSENT_VERSION}])assert.equal((await s.call('/contributions','POST',{...s.payload(),consent})).status,400);
 assert.equal(s.objects.size,0);assert.equal(s.rows.length,0);
 const payload=s.payload();payload.consent.accepted=false;
 const saved=await s.call('/contributions','POST',payload);assert.equal(saved.status,201);const id=saved.body.photo.id,cookie=ownerCookie(saved);
 assert.match(cookie,/km_account=/);assert.equal(s.rows[0].owner_key,'u:'+s.ids.a);assert.equal(s.rows[0].owner_user_id,s.ids.a);
 assert.equal((await s.rawCall('/contributions')).status,401);
 assert.equal((await s.call('/contributions','GET',undefined,cookie)).body.total,1);
 assert.equal((await s.rawCall('/photos/'+id)).status,401);
 const staff=await s.login('researcher');
 assert.equal((await s.call('/contributions?scope=dataset','GET',undefined,staff)).body.total,0);
 assert.equal((await s.call('/photos/'+id+'/image-link','GET',undefined,staff)).status,404);
 assert.equal((await s.call('/photos/'+id+'/image','GET',undefined,cookie)).status,200);
});
test('authenticated ownership cannot be forged; approved roles use JWT RPC and sanitized records',async()=>{
 const s=setup();const a=await s.login('a'),b=await s.login('b');
 const saved=await s.call('/contributions','POST',{...s.payload(),owner_user_id:s.ids.b},a),id=saved.body.photo.id;
 assert.equal(s.rows[0].owner_user_id,s.ids.a);
 for(const suffix of ['','/image','/image-link'])assert.equal((await s.call('/photos/'+id+suffix,'GET',undefined,b)).status,404);
 assert.equal((await s.call('/photos/'+id,'DELETE',undefined,b)).status,404);
 assert.equal((await s.call('/contributions?scope=dataset','GET',undefined,b)).status,403);
 for(const role of ['researcher','expert','admin']){
  const cookie=await s.login(role);const listed=await s.call('/contributions?scope=dataset','GET',undefined,cookie);assert.equal(listed.body.total,1);
  const text=JSON.stringify(listed.body);for(const privateText of ['PRIVATE','owner_key','owner_user_id','coordinates','object_path'])assert.ok(!text.includes(privateText));
  const link=await s.call('/photos/'+id+'/image-link','GET',undefined,cookie);assert.equal(link.status,200);assert.equal(link.body.expiresIn,60);
 }
 const rpc=s.calls.find(c=>c.path.endsWith('/km_research_photo_records'));assert.equal(rpc.headers.apikey,'sb_publishable_fixture');assert.ok(rpc.headers.Authorization.startsWith('Bearer '));
});
test('idempotency handles retry and changed payload without duplicate files; server strips EXIF',async()=>{
 const s=setup();const decorated=await sharp(Buffer.from(image.base64,'base64')).withMetadata({exif:{IFD0:{Artist:'PRIVATE EXIF'}}}).toBuffer();
 const payload={...s.payload(),image:{...image,base64:decorated.toString('base64')}};
 const first=await s.call('/contributions','POST',payload),cookie=ownerCookie(first);assert.equal(first.status,201);
 assert.equal((await s.call('/contributions','POST',payload,cookie)).status,200);assert.equal(s.rows.length,1);assert.equal(s.objects.size,1);
 assert.equal((await s.call('/contributions','POST',{...payload,details:{}},cookie)).status,409);
 const metadata=await sharp([...s.objects.values()][0]).metadata();assert.equal(metadata.exif,undefined);assert.equal(metadata.icc,undefined);
 assert.match(s.rows[0].object_path,/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);assert.equal(s.rows[0].bucket,'km-crop-photos');assert.equal(s.rows[0].ai_status,'not_attached');
});
test('save failures clean uploaded objects, retain retryable cleanup jobs and never report saved',async()=>{
 const s=setup();s.state.failDatabase=true;
 const failed=await s.call('/contributions','POST',s.payload());assert.equal(failed.status,503);assert.ok(!failed.text.includes('PRIVATE DATABASE'));assert.equal(s.rows.length,0);assert.equal(s.objects.size,0);
 assert.match(failed.body.error.message,/guidance remains available/);
 s.state.failCleanup=true;assert.equal((await s.call('/contributions','POST',s.payload())).status,503);assert.equal(s.objects.size,1);assert.equal(s.jobs.size,1);
 s.state.failCleanup=false;assert.equal((await s.store.reconcile({minimumAge:0})).deleted,1);assert.equal(s.objects.size,0);assert.equal(s.jobs.size,0);
 s.state.failDatabase=false;s.state.failUpload=true;assert.equal((await s.call('/contributions','POST',s.payload())).status,503);assert.equal(s.rows.length,0);
});
test('lost database response recovers committed record and preserves its file',async()=>{
 const s=setup();s.state.lostCommit=true;const response=await s.call('/contributions','POST',s.payload());assert.equal(response.status,200);assert.equal(response.body.duplicate,true);assert.equal(s.rows.length,1);assert.equal(s.objects.size,1);
});
test('withdrawal blocks dataset, annotations and new image links while retained owner access remains; full withdrawal deletes bytes',async()=>{
 const s=setup();const saved=await s.call('/contributions','POST',s.payload()),id=saved.body.photo.id,owner=ownerCookie(saved),staff=await s.login('expert');
 const review={outcome:'labeled',label:'Expert observation',notes:'Test evidence',expectedReviewId:null};
 const reviewed=await s.call('/photos/'+id+'/reviews','POST',review,staff);assert.equal(reviewed.status,201);assert.equal(reviewed.body.photo.reviews[0].expertConfirmed,true);
 assert.equal((await s.call('/photos/'+id+'/reviews','POST',review,staff)).status,409);
 const withdrawn=await s.call('/photos/'+id+'/consent','PATCH',{research:false},owner);assert.equal(withdrawn.status,200);assert.equal(withdrawn.body.issuedLinkMaxSeconds,60);
 assert.equal((await s.call('/contributions?scope=dataset','GET',undefined,staff)).body.total,0);
 for(const suffix of ['','/image','/image-link'])assert.equal((await s.call('/photos/'+id+suffix,'GET',undefined,staff)).status,404);
 assert.equal((await s.call('/photos/'+id+'/reviews','POST',{...review,expectedReviewId:1},staff)).status,403);
 assert.equal((await s.call('/photos/'+id+'/image','GET',undefined,owner)).status,200);
 const removed=await s.call('/photos/'+id,'DELETE',undefined,owner);assert.equal(removed.status,200);assert.equal(s.objects.size,0);
 assert.equal((await s.call('/photos/'+id+'/image','GET',undefined,owner)).status,404);
 assert.equal((await s.call('/contributions','POST',s.payload(),owner)).status,201);
});
test('revoked approval takes effect on next request; local researcher cookies cannot authorize cloud access',async()=>{
 const s=setup();const saved=await s.call('/contributions','POST',s.payload()),staff=await s.login('researcher');delete s.roles.researcher;
 assert.equal((await s.call('/contributions?scope=dataset','GET',undefined,staff)).status,403);
 assert.equal((await s.call('/contributions?scope=dataset','GET',undefined,'km_research='+'a'.repeat(43))).status,401);
 assert.equal((await s.call('/photos/'+saved.body.photo.id+'/reviews','POST',{outcome:'labeled',label:'forged',notes:'test',expectedReviewId:null},staff)).status,403);
});
test('analysis is temporary without retention; only image-matched server receipts attach original AI output',async()=>{
 const s=setup({clientFactory:sdkMock(async()=>({...sdkResponse(demoAnalysis),modelVersion:'gemini-fixture-v1'}))});
 const analysis=await callHandler(s.app,{headers:{cookie:await s.login('a')},path:'/api/analyze',body:{mode:'live',language:'gu',consent:true,image}});assert.equal(analysis.status,200);assert.ok(analysis.body.analysisReceipt);assert.equal(s.rows.length,0);assert.equal(s.objects.size,0);
 const payload={...s.payload(),analysisReceipt:analysis.body.analysisReceipt,aiResult:{forged:true}};
 const saved=await s.call('/contributions','POST',payload);assert.equal(saved.status,201);assert.deepEqual(s.rows[0].ai_result,analysis.body.analysis);assert.equal(s.rows[0].ai_model,'gemini-3.8-flash');assert.equal(s.rows[0].ai_version,'gemini-fixture-v1');
 const staff=await s.login('researcher');const review=await s.call('/photos/'+saved.body.photo.id+'/reviews','POST',{outcome:'inconclusive',label:'',notes:'More evidence',expectedReviewId:null},staff);assert.equal(review.status,201);assert.deepEqual(s.rows[0].ai_result,analysis.body.analysis);
 assert.equal((await s.call('/contributions','POST',{...s.payload(),analysisReceipt:'forged'})).status,409);
 const other=await sharp(Buffer.from(image.base64,'base64')).modulate({brightness:0.8}).jpeg().toBuffer();
 assert.equal((await s.call('/contributions','POST',{...s.payload(),analysisReceipt:analysis.body.analysisReceipt,image:{...image,base64:other.toString('base64')}})).status,409);
});
test('durable cleanup outbox survives reopen and stores metadata only',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'photo-outbox-'));try{const id=randomUUID(),path=randomUUID()+'/'+id+'.jpg';openPhotoOutbox(folder).add(id,path);const reopened=openPhotoOutbox(folder);assert.equal(reopened.entries()[0].objectPath,path);reopened.remove(id);assert.deepEqual(reopened.entries(),[]);}finally{await rm(folder,{recursive:true,force:true});}
});

test('concurrent retries share verified account ownership and never create a second file',async()=>{
 const s=setup();const me=await s.call('/me'),cookie=ownerCookie(me),payload=s.payload();let release;
 s.state.waitUpload=new Promise(resolve=>{release=resolve;});
 const first=s.call('/contributions','POST',payload,cookie);
 const deadline=Date.now()+2000;
 while(!s.calls.some(c=>c.method==='POST'&&c.path.startsWith('/storage/v1/object/km-crop-photos/'))&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
 try{const concurrent=await s.call('/contributions','POST',payload,cookie);assert.equal(concurrent.status,409);assert.equal(concurrent.body.error.code,'RESEARCH_PENDING');}finally{release();}
 assert.equal((await first).status,201);
 assert.equal((await s.call('/contributions','POST',payload,cookie)).status,200);
 assert.equal(s.rows.length,1);assert.equal(s.objects.size,1);
});
test('invalid images and oversized payloads never reach Storage; backend-only secret stays out of responses',async()=>{
 const s=setup();for(const invalid of [{...image,mimeType:'image/png'},{...image,base64:'not-an-image'},{...image,base64:'A'.repeat(4*1024*1024+4)}]){
  const response=await s.call('/contributions','POST',{...s.payload(),image:invalid});assert.ok([400,413].includes(response.status));assert.ok(!response.text.includes('sb_secret_'));
 }
 assert.equal(s.objects.size,0);assert.equal(s.rows.length,0);
 const saved=await s.call('/contributions','POST',s.payload());assert.ok(!saved.text.includes('sb_secret_'));assert.ok(!saved.text.includes('owner_key'));assert.ok(!saved.text.includes('object_path'));
 const upload=s.calls.find(c=>c.method==='POST'&&c.path.startsWith('/storage/v1/object/km-crop-photos/'));assert.equal(upload.headers['Content-Type'],'image/jpeg');assert.equal(upload.headers['x-upsert'],'false');
});
test('withdrawal deletion failure blocks access immediately and leaves a durable cleanup job',async()=>{
 const s=setup();const saved=await s.call('/contributions','POST',s.payload()),owner=ownerCookie(saved);s.state.failCleanup=true;
 const revoked=await s.call('/photos/'+saved.body.photo.id,'DELETE',undefined,owner);assert.equal(revoked.status,200);assert.equal(revoked.body.cleanupPending,true);
 assert.equal(s.jobs.size,1);assert.equal(s.objects.size,1);assert.equal(s.rows[0].status,'withdrawn');assert.deepEqual(s.rows[0].details,{});assert.equal(s.rows[0].ai_result,null);
 assert.equal((await s.call('/photos/'+saved.body.photo.id+'/image-link','GET',undefined,owner)).status,404);
 s.state.failCleanup=false;assert.equal((await s.store.reconcile({minimumAge:0})).deleted,1);assert.equal(s.objects.size,0);
});

test('research CSV excludes farmer details and preserves human versus AI provenance',async()=>{
 const s=setup();const saved=await s.call('/contributions','POST',s.payload()),expert=await s.login('expert');
 await s.call('/photos/'+saved.body.photo.id+'/reviews','POST',{outcome:'labeled',label:'Expert label',notes:'Crop evidence',expectedReviewId:null},expert);
 const csv=await s.call('/export.csv','GET',undefined,expert);assert.equal(csv.status,200);assert.match(csv.text,/expert_confirmed/);assert.match(csv.text,/Expert label/);
 for(const text of ['PRIVATE','owner_key','owner_user_id','coordinates','sb_secret'])assert.ok(!csv.text.includes(text));
 assert.equal((await s.rawCall('/export.csv')).status,401);
});

test('legacy public flags cannot enable public dataset access or change consent audience',async()=>{
 const s=setup({publicAccess:true});
 assert.equal(s.store.publicAccess,false);assert.equal(s.store.consentVersion,PHOTO_CONSENT_VERSION);
 assert.equal((await s.rawCall('/contributions?scope=dataset')).status,401);
 assert.equal((await s.call('/contributions?scope=dataset')).status,403);
 assert.equal((await s.call('/me')).body.publicAccess,false);
 const saved=await s.call('/contributions','POST',s.payload());assert.equal(saved.status,201);
 assert.equal(s.rows[0].public_research_consent,false);
 const other=await s.login('b');assert.equal((await s.call('/photos/'+saved.body.photo.id,'GET',undefined,other)).status,404);
 const staff=await s.login('researcher');assert.equal((await s.call('/contributions?scope=dataset','GET',undefined,staff)).body.total,1);
});
