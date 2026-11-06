import {ApiError} from './errors.js';
import {boundedText} from './research-store.js';

export function createSupabaseCommunityApi({accounts,readJson,json}) {
 const rates=new Map();
 return async(req,res,url)=>{
  const account=await accounts.requireUser(req);
  let action,id=null,input={},status=200;
  if(url.pathname==='/api/community/posts'){
   if(req.method==='GET')action='list';
   if(req.method==='POST'){action='post';status=201;}
  }else{
   const match=url.pathname.match(/^\/api\/community\/posts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/(replies|status))?$/i);
   if(match){
    id=match[1];
    if(!match[2]&&req.method==='GET')action='get';
    if(!match[2]&&req.method==='DELETE')action='delete';
    if(match[2]==='replies'&&req.method==='POST'){action='reply';status=201;}
    if(match[2]==='status'&&req.method==='POST')action='status';
   }
  }
  if(!action)throw new ApiError(404,'COMMUNITY_NOT_FOUND','This community action is unavailable.');
  if(req.method!=='GET'){
   const now=Date.now();for(const[k,v]of rates)if(v.until<=now)rates.delete(k);
   const key=account.user.id,rate=rates.get(key)||{count:0,until:now+600000};
   if(++rate.count>30||(!rates.has(key)&&rates.size>=1000))throw new ApiError(429,'COMMUNITY_LIMIT','Too many community requests. Try again later.');
   rates.set(key,rate);
  }
  if(['post','reply','status'].includes(action))input=await readJson(req,16_384);
  if(action==='post'||action==='reply'){
   if(input?.shared!==true)throw new ApiError(400,'COMMUNITY_CONSENT','Confirm sharing with signed-in members first.');
   input={shared:true,alias:boundedText(input.alias,50,true),body:boundedText(input.body,action==='post'?3000:2000,true),...(action==='post'?{title:boundedText(input.title,160,true)}:{})};
  }
  if(action==='status'){
   if(typeof input?.resolved!=='boolean')throw new ApiError(400,'COMMUNITY_INPUT','Choose a question status.');
   input={resolved:input.resolved};
  }
  const data=await accounts.remote('/rest/v1/rpc/km_community',{method:'POST',accessToken:account.accessToken,body:{action,post_id:id,input,search_query:action==='list'?boundedText(url.searchParams.get('q'),100):''}});
  if(!data||typeof data!=='object'||(action==='list'?!Array.isArray(data.posts):action==='delete'?data.removed!==true:!data.post))throw new ApiError(502,'COMMUNITY_RESPONSE','Community storage returned an invalid response.');
  return json(res,status,{...data,storage:'supabase',supabaseConnected:true});
 };
}
