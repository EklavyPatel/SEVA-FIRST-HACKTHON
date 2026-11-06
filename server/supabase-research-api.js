import {decodeImage} from './image.js';
import {ApiError} from './errors.js';
import {boundedText,PARTS} from './research-store.js';
import {photoDetails} from './supabase-photos.js';
export function createSupabaseResearchApi(store,{readJson,json,identity,resolveAnalysis,secureCookies=false}) {
 const limits=new Map();let active=0;const publicAccess=false;
 function limit(req){const now=Date.now();for(const[k,v]of limits)if(v.until<=now)limits.delete(k);const key=req.socket.remoteAddress;const b=limits.get(key)||{count:0,until:now+600_000};if(++b.count>30||limits.size>=1000)throw new ApiError(429,'RESEARCH_RATE','Too many photo requests. Try again later.');limits.set(key,b);}
 return async(req,res,url)=>{
  if(!store)throw new ApiError(503,'RESEARCH_UNAVAILABLE','Supabase photo storage is not configured. Crop analysis remains available.');
  const account=await identity(req);
  if(!account)throw new ApiError(401,'ACCOUNT_AUTH','Log in with a confirmed account first.');
  const staff=account&&['researcher','expert','admin'].includes(account.user.role)?{...account.user,accessToken:account.accessToken}:null;
  const owner=store.owner(account);
  const needsStaff=()=>{if(!staff)throw new ApiError(403,'RESEARCH_AUTH','Log in with an approved researcher, expert or administrator account.');return staff;};
  if(url.pathname==='/api/research/me'&&req.method==='GET'){
   return json(res,200,{available:true,storage:'supabase',accountOnly:true,publicAccess,consentVersion:store.consentVersion,stats:await store.stats(owner,account.accessToken),researcher:staff?{id:staff.id,name:'Approved '+staff.role,institution:'Account approved by project administrator',role:staff.role,external:true}:null});
  }
  if(url.pathname==='/api/research/login')throw new ApiError(401,'RESEARCH_AUTH','Use the account Log in page and request research approval.');
  if(url.pathname==='/api/research/logout'&&req.method==='POST')return json(res,200,{signedOut:true});
  if(url.pathname==='/api/research/contributions'){
   if(req.method==='GET'){
    const scope=url.searchParams.get('scope')||'mine',status=url.searchParams.get('status')||'all',part=url.searchParams.get('part')||'all',offset=Number(url.searchParams.get('offset')||0);
    if(!['mine','dataset'].includes(scope)||!['all','reviewed','unreviewed'].includes(status)||!['all',...PARTS].includes(part)||!Number.isSafeInteger(offset)||offset<0||offset>10000)throw new ApiError(400,'RESEARCH_INPUT','Please check the research filters.');
    if(scope==='dataset')needsStaff();
    return json(res,200,await store.list({...(scope==='mine'?{owner,accessToken:account.accessToken}:{staff}),q:boundedText(url.searchParams.get('q'),100),status,part,offset}));
   }
   if(req.method==='POST'){
    limit(req);if(active>=2)throw new ApiError(429,'RESEARCH_RATE','Photo saving is busy. Try again later.');active++;
    try{
     const input=await readJson(req);
     if(input?.consent?.retention!==true||input.consent.version!==store.consentVersion||typeof input.consent.accepted!=='boolean')throw new ApiError(400,'RESEARCH_CONSENT','Choose photo retention and optional researcher sharing separately.');
     const details=photoDetails(input.details),decoded=await decodeImage(input.image);
     const image={data:Buffer.from(decoded.base64,'base64'),width:decoded.width,height:decoded.height};
     const analysis=resolveAnalysis(input.analysisReceipt,image);
     if(!owner)throw new ApiError(400,'RESEARCH_OWNER','Open the contribution form first to establish a private owner session.');
     const saved=await store.save({owner,userId:account.user.id,accessToken:account.accessToken,requestKey:input.requestKey,image,details,consent:input.consent,analysis});
     return json(res,saved.duplicate?200:201,saved);
    }finally{active--;}
   }
  }
  if(url.pathname==='/api/research/export.csv'&&req.method==='GET'){needsStaff();limit(req);const csv=await store.exportCsv(staff);res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Cache-Control':'no-store','Content-Disposition':'attachment; filename="cotton-research-labels.csv"'});return res.end(csv);}
  const match=url.pathname.match(/^\/api\/research\/photos\/([0-9a-f-]{36})(?:\/(image|image-link|reviews|consent))?$/i);
  if(match){const[,id,action]=match;const access={owner,staff,accessToken:account.accessToken};
   if(action==='image'&&['GET','HEAD'].includes(req.method)){const data=await store.image(id,access);res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store','Content-Length':data.length});return res.end(req.method==='HEAD'?undefined:data);}
   if(action==='image-link'&&req.method==='GET'){limit(req);return json(res,200,await store.imageLink(id,access));}
   if(action==='reviews'&&req.method==='POST'){needsStaff();limit(req);return json(res,201,{photo:await store.review(id,staff,await readJson(req,16384))});}
   if(action==='consent'&&req.method==='PATCH'){limit(req);const input=await readJson(req,4096);if(input?.research!==false)throw new ApiError(400,'RESEARCH_INPUT','Only consent withdrawal is supported here.');return json(res,200,await store.revoke(id,owner,{accessToken:account.accessToken}));}
   if(!action&&req.method==='GET')return json(res,200,{photo:await store.photo(id,access)});
   if(!action&&req.method==='DELETE'){limit(req);return json(res,200,await store.revoke(id,owner,{remove:true,accessToken:account.accessToken}));}
  }
  throw new ApiError(404,'RESEARCH_NOT_FOUND','This research action is unavailable.');
 };
}
