import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const sharp = (await import(createRequire(new URL('../server/package.json', import.meta.url)).resolve('sharp'))).default;
import {createLegacyResearchApp as createApp} from './helpers/legacy-research-app.mjs';
import { openResearchStore, CONSENT_VERSION, csvCell } from '../server/research-store.js';
import { normalizeResearchImage } from '../server/research-api.js';
import { callHandler } from './http.js';

const fixture=await readFile(new URL('./fixtures/cotton-illustration.jpg',import.meta.url));
const image={mimeType:'image/jpeg',base64:fixture.toString('base64')};
const input=()=>({image,requestKey:randomUUID(),details:{district:'Ahmedabad',plantPart:'leaf',symptoms:'Small pale marks'},consent:{accepted:true,version:CONSENT_VERSION}});
const cookieFrom=response=>(response.headers['set-cookie']||'').split(';')[0];
function setup(options={}){const store=openResearchStore({path:':memory:',...options});return{store,app:createApp({researchStore:store})};}
async function request(app,path,method='GET',body,cookie){return callHandler(app,{path:'/api/research'+path,method,body,headers:cookie?{cookie}:{}});}
async function login(app,store){await store.addResearcher({username:'fixture-reviewer',name:'Fixture reviewer',institution:'Test university',password:'fixture-passphrase-only'});return cookieFrom(await request(app,'/login','POST',{username:'fixture-reviewer',password:'fixture-passphrase-only'}));}

test('contributions require versioned explicit consent; unsupported or malformed photos never persist',async()=>{
 const{app,store}=setup();try{
  for(const consent of [undefined,{accepted:false,version:CONSENT_VERSION},{accepted:true,version:'old'}]){
   const response=await request(app,'/contributions','POST',{...input(),consent});assert.equal(response.status,400);assert.equal(response.body.error.code,'RESEARCH_CONSENT');
  }
  const invalid={mimeType:'image/jpeg',base64:Buffer.from([0xff,0xd8,0xff,0xc0,0,17,8,0,64,0,64,3,1,17,0,2,17,0,3,17,0,0xff,0xd9]).toString('base64')};
  assert.equal((await request(app,'/contributions','POST',{...input(),image:invalid})).status,400);
  assert.equal(store.list().total,0);
 }finally{store.close();}
});
test('farmer ownership, idempotency and private images are enforced on the server',async()=>{
 const{app,store}=setup();try{
  const payload=input();const created=await request(app,'/contributions','POST',payload);assert.equal(created.status,201);
  const cookie=cookieFrom(created);const id=created.body.photo.id;
  assert.match(created.headers['set-cookie'],/HttpOnly; SameSite=Strict/);
  assert.equal((await request(app,'/contributions')).body.total,0);
  assert.equal((await request(app,'/contributions','GET',undefined,cookie)).body.total,1);
  for(const suffix of ['', '/image'])assert.equal((await request(app,`/photos/${id}${suffix}`)).status,404);
  const photo=await request(app,`/photos/${id}/image`,'GET',undefined,cookie);assert.equal(photo.status,200);assert.equal(photo.headers['cache-control'],'no-store');assert.equal(photo.headers['content-type'],'image/jpeg');
  const second=await request(app,'/contributions','POST',payload,cookie);assert.equal(second.status,200);assert.equal(second.body.photo.id,id);assert.equal(store.list().total,1);
  assert.equal((await request(app,'/contributions','POST',{...payload,details:{...payload.details,symptoms:'changed'}},cookie)).status,409);
  assert.equal((await request(app,'/contributions?scope=dataset','GET',undefined,cookie)).status,401);
  assert.equal((await request(app,'/export.csv','GET',undefined,cookie)).status,401);
  const other=await request(app,'/contributions','POST',input());
  assert.equal((await request(app,`/photos/${id}`,'DELETE',undefined,cookieFrom(other))).status,404);
  assert.equal((await request(app,`/photos/${id}/reviews`,'POST',{outcome:'labeled',label:'forged',notes:'test',expectedReviewId:null},cookie)).status,401);
 }finally{store.close();}
});
test('authorized reviews retain provenance, detect concurrent edits, and filter the collection',async()=>{
 const{app,store}=setup();try{
  const farmer=await request(app,'/contributions','POST',input());const id=farmer.body.photo.id;const farmerCookie=cookieFrom(farmer);
  const staff=await login(app,store);
  assert.equal((await request(app,'/contributions?scope=dataset','GET',undefined,staff)).body.total,1);
  const annotation={outcome:'labeled',label:'Needs field confirmation',notes:'Visible marks; laboratory confirmation still needed.',expectedReviewId:null,reviewer:'FORGED',institution:'FORGED'};
  const review=await request(app,`/photos/${id}/reviews`,'POST',annotation,staff);assert.equal(review.status,201);
  assert.equal(review.body.photo.reviewer,'Fixture reviewer');assert.equal(review.body.photo.institution,'Test university');
  assert.equal((await request(app,`/photos/${id}/reviews`,'POST',annotation,staff)).status,409);
  const next=await request(app,`/photos/${id}/reviews`,'POST',{outcome:'inconclusive',label:'',notes:'More evidence needed.',expectedReviewId:review.body.photo.reviewId},staff);
  assert.equal(next.status,201);assert.equal(next.body.photo.reviews.length,2);
  assert.equal((await request(app,'/contributions?scope=dataset&status=reviewed','GET',undefined,staff)).body.total,1);
  assert.equal((await request(app,'/contributions?scope=dataset&status=unreviewed','GET',undefined,staff)).body.total,0);
  assert.equal((await request(app,'/contributions?scope=dataset&part=boll','GET',undefined,staff)).body.total,0);
  assert.equal((await request(app,'/contributions?scope=dataset&q=ahmed','GET',undefined,staff)).body.total,1);
  assert.equal((await request(app,'/contributions?scope=dataset&q=%27%20OR%201=1','GET',undefined,staff)).body.total,0);
  assert.equal((await request(app,`/photos/${id}`,'GET',undefined,farmerCookie)).body.photo.reviews.length,2);
 }finally{store.close();}
});
test('withdrawal removes image, reviews, and exports; researcher sessions cannot withdraw others photos',async()=>{
 const{app,store}=setup();try{
  const created=await request(app,'/contributions','POST',input());const id=created.body.photo.id;const owner=cookieFrom(created);const staff=await login(app,store);
  await request(app,`/photos/${id}/reviews`,'POST',{outcome:'inconclusive',label:'',notes:'More evidence needed.',expectedReviewId:null},staff);
  assert.equal((await request(app,`/photos/${id}`,'DELETE',undefined,staff)).status,404);
  assert.match((await request(app,'/export.csv','GET',undefined,staff)).text,new RegExp(id));
  assert.equal((await request(app,`/photos/${id}`,'DELETE',undefined,owner)).body.withdrawn,true);
  assert.equal((await request(app,`/photos/${id}/image`,'GET',undefined,staff)).status,404);
  assert.equal((await request(app,'/contributions?scope=dataset','GET',undefined,staff)).body.total,0);
  assert.doesNotMatch((await request(app,'/export.csv','GET',undefined,staff)).text,new RegExp(id));
 }finally{store.close();}
});
test('failed logins are limited; sign-out and account revocation invalidate existing sessions',async()=>{
 const{app,store}=setup();try{
  const staff=await login(app,store);const me=await request(app,'/me','GET',undefined,staff);assert.equal(me.body.researcher.username,'fixture-reviewer');
  assert.equal(JSON.stringify(me.body).includes('password'),false);
  await request(app,'/logout','POST',{},staff);
  assert.equal((await request(app,'/contributions?scope=dataset','GET',undefined,staff)).status,401);
  const newSession=cookieFrom(await request(app,'/login','POST',{username:'fixture-reviewer',password:'fixture-passphrase-only'}));store.disableResearcher('fixture-reviewer');
  assert.equal((await request(app,'/contributions?scope=dataset','GET',undefined,newSession)).status,401);
  for(let i=0;i<6;i++) assert.equal((await request(app,'/login','POST',{username:'unknown',password:'wrong'})).status,401);
  assert.equal((await request(app,'/login','POST',{username:'unknown',password:'wrong'})).status,429);
 }finally{store.close();}
});
test('stored JPEG is fully decoded, re-encoded without embedded metadata, and survives a database reopen',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'cotton-research-'));const path=join(folder,'research.sqlite');let store;
 try{
  const decorated=await sharp(fixture).withMetadata({exif:{IFD0:{Artist:'PRIVATE FIXTURE'}}}).toBuffer();
  const normalized=await normalizeResearchImage({mimeType:'image/jpeg',base64:decorated.toString('base64')});
  const metadata=await sharp(normalized.data).metadata();assert.equal(metadata.exif,undefined);assert.equal(metadata.icc,undefined);
  store=openResearchStore({path});const owner=store.ensureContributor();const saved=store.save({owner:owner.id,requestKey:randomUUID(),image:normalized,details:{plantPart:'leaf',district:'',symptoms:''}});
  store.close();store=openResearchStore({path});assert.equal(store.list({owner:store.contributor(owner.token)}).total,1);
  assert.deepEqual(Buffer.from(store.image(saved.photo.id,{owner:owner.id})),normalized.data);
 }finally{store?.close();await rm(folder,{recursive:true,force:true});}
});
test('exports escape spreadsheet formulas and do not expose contributor identifiers or authentication tokens',async()=>{
 const{app,store}=setup();try{
  const created=await request(app,'/contributions','POST',{...input(),details:{district:'=1+1',plantPart:'leaf',symptoms:'+SUM(A1:A2)'}});const staff=await login(app,store);
  const exported=await request(app,'/export.csv','GET',undefined,staff);assert.equal(exported.status,200);
  assert.match(exported.text,/"'=1\+1"/);assert.match(exported.text,/"'\+SUM/);
  assert.doesNotMatch(exported.text,/contributor|token|password|\/api\//i);
  assert.doesNotMatch(exported.text,new RegExp(cookieFrom(created).split('=')[1]));
  assert.equal(csvCell('  @SUM(A1)'), '"\'  @SUM(A1)"');
 }finally{store.close();}
});
test('storage quotas fail clearly and hostile origins cannot submit or read research data',async()=>{
 const{app,store}=setup({maxPhotos:1});try{
  assert.equal((await request(app,'/contributions','POST',input())).status,201);
  assert.equal((await request(app,'/contributions','POST',input())).status,507);
  const denied=await callHandler(app,{path:'/api/research/me',method:'GET',headers:{origin:'https://untrusted.example'}});assert.equal(denied.status,403);
  assert.equal((await request(app,'/contributions?scope=unknown')).status,400);
  assert.equal((await request(app,'/contributions?offset=-1')).status,400);
 }finally{store.close();}
});

test('all research questions can be skipped, including location and plant part',async()=>{
 const {app,store}=setup();try{
  const payload=input();delete payload.details;
  const r=await request(app,'/contributions','POST',payload);assert.equal(r.status,201);assert.equal(r.body.photo.plantPart,'unknown');assert.equal(r.body.photo.district,'');assert.equal(r.body.photo.symptoms,'');assert.deepEqual(r.body.photo.fieldContext,{});
 }finally{store.close();}
});
test('optional context persists, exports safely and rounds only consented coordinates',async()=>{
 const {app,store}=setup();try{
  const details={...input().details,fieldContext:{state:'Gujarat',village:'Example test area',photoDate:'2026-10-30',variety:'Test hybrid',cropAgeDays:'65',growthStage:'flowering',symptomDays:'0',affectedPercent:'12.5',recentInputs:'=UNTRUSTED',coordinates:{latitude:23.0371,longitude:72.5822},shareCoordinates:true,unknownField:'must be dropped'}};
  const payload={...input(),details};const saved=await request(app,'/contributions','POST',payload);assert.equal(saved.status,201);
  const c=saved.body.photo.fieldContext;assert.equal(c.cropAgeDays,65);assert.equal(c.symptomDays,0);assert.equal(c.affectedPercent,12.5);assert.deepEqual(c.coordinates,{latitude:23.04,longitude:72.58});assert.equal(c.unknownField,undefined);
  const staff=await login(app,store);const exported=await request(app,'/export.csv','GET',undefined,staff);assert.match(exported.text,/Example test area/);assert.match(exported.text,/23\.04/);assert.match(exported.text,/"'=UNTRUSTED"/);
  const other=await request(app,'/contributions','POST',{...payload,details:{...details,fieldContext:{...details.fieldContext,cropAgeDays:66}}},cookieFrom(saved));assert.equal(other.status,409);
  const fetched=await request(app,`/photos/${saved.body.photo.id}`,'GET',undefined,staff);assert.deepEqual(fetched.body.photo.fieldContext,c);
 }finally{store.close();}
});
test('invalid optional values and coordinates without a separate opt-in are rejected before saving',async()=>{
 const {app,store}=setup();try{
  for(const context of [{cropAgeDays:-1},{cropAgeDays:2.5},{affectedPercent:101},{photoDate:'2026-02-30'},{growthStage:'invented'},{coordinates:{latitude:23,longitude:72}},{coordinates:{latitude:91,longitude:72},shareCoordinates:true},{village:'x'.repeat(121)}]){
   const payload=input();payload.details.fieldContext=context;assert.equal((await request(app,'/contributions','POST',payload)).status,400);
  }
  assert.equal(store.list().total,0);
 }finally{store.close();}
});
test('an existing 14-column photo database is migrated without losing old records',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const folder=await mkdtemp(join(tmpdir(),'cotton-old-schema-'));const path=join(folder,'legacy.sqlite');const id=randomUUID();let store;
 try{
 const legacy=new DatabaseSync(path);legacy.exec(`CREATE TABLE contributors(id TEXT PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,created_at TEXT NOT NULL);CREATE TABLE research_photos(id TEXT PRIMARY KEY,contributor_id TEXT NOT NULL,request_key TEXT NOT NULL,payload_hash TEXT NOT NULL,image BLOB NOT NULL,byte_size INTEGER NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,district TEXT NOT NULL,plant_part TEXT NOT NULL,symptoms TEXT NOT NULL,consent_version TEXT NOT NULL,consent_at TEXT NOT NULL,created_at TEXT NOT NULL);`);
 legacy.prepare('INSERT INTO contributors VALUES(?,?,?)').run('legacy-owner','legacy-hash','2026-10-30');legacy.prepare('INSERT INTO research_photos VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,'legacy-owner',randomUUID(),'legacy-payload',fixture,fixture.length,640,480,'Old district','leaf','Old observation',CONSENT_VERSION,'2026-10-30','2026-10-30');legacy.close();
 store=openResearchStore({path});const photo=store.photo(id,{owner:'legacy-owner'});assert.equal(photo.district,'Old district');assert.deepEqual(photo.fieldContext,{});assert.equal(store.list().total,1);
 }finally{store?.close();await rm(folder,{recursive:true,force:true});}
});
