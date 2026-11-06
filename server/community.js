import {randomUUID} from 'node:crypto';
import {ApiError} from './errors.js';
import {boundedText} from './research-store.js';
export function createCommunityStore(db){
 db.exec(`CREATE TABLE IF NOT EXISTS community_posts(id TEXT PRIMARY KEY,owner TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,alias TEXT NOT NULL,created_at TEXT NOT NULL,resolved INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS community_replies(id TEXT PRIMARY KEY,post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,owner TEXT NOT NULL,body TEXT NOT NULL,alias TEXT NOT NULL,staff INTEGER NOT NULL,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS community_reply_post ON community_replies(post_id,created_at);`);
 function get(id,owner){const p=db.prepare('SELECT id,title,body,alias,created_at AS createdAt,resolved,owner FROM community_posts WHERE id=?').get(id);if(!p)throw new ApiError(404,'COMMUNITY_NOT_FOUND','This community question is unavailable.');return {...p,mine:p.owner===owner,owner:undefined,replies:db.prepare('SELECT id,body,alias,staff,created_at AS createdAt FROM community_replies WHERE post_id=? ORDER BY created_at,id').all(id)};}
 return {
 list(owner,q=''){return db.prepare("SELECT id FROM community_posts WHERE instr(lower(title||' '||body),lower(?))>0 ORDER BY created_at DESC LIMIT 100").all(q).map(p=>get(p.id,owner));},get,
 post(owner,input){if(input.shared!==true)throw new ApiError(400,'COMMUNITY_CONSENT','Confirm that you want to share this question with the community.');if(db.prepare('SELECT COUNT(*) AS n FROM community_posts').get().n>=1000)throw new ApiError(507,'COMMUNITY_FULL','The local community is full. Contact the project team.');const id=randomUUID();db.prepare('INSERT INTO community_posts VALUES(?,?,?,?,?,?,0)').run(id,owner,boundedText(input.title,160,true),boundedText(input.body,3000,true),boundedText(input.alias,50,true),new Date().toISOString());return get(id,owner);},
 reply(id,owner,input,staff){get(id,owner);if(db.prepare('SELECT COUNT(*) AS n FROM community_replies WHERE post_id=?').get(id).n>=100)throw new ApiError(429,'COMMUNITY_LIMIT','This discussion has reached its reply limit.');db.prepare('INSERT INTO community_replies VALUES(?,?,?,?,?,?,?)').run(randomUUID(),id,owner,boundedText(input.body,2000,true),staff?staff.name:boundedText(input.alias,50,true),staff?1:0,new Date().toISOString());return get(id,owner);},
 remove(id,owner){const p=get(id,owner);if(!p.mine)throw new ApiError(403,'COMMUNITY_OWNER','Only the author can remove this question.');db.prepare('DELETE FROM community_posts WHERE id=?').run(id);return {removed:true};},
 resolve(id,owner,value){if(typeof value!=='boolean')throw new ApiError(400,'COMMUNITY_INPUT','Choose a question status.');if(!get(id,owner).mine)throw new ApiError(403,'COMMUNITY_OWNER','Only the author can update this question.');db.prepare('UPDATE community_posts SET resolved=? WHERE id=?').run(value?1:0,id);return get(id,owner);}
 };
}
export function createCommunityApi(store,{readJson,json,externalStaff=async()=>null,identity,secureCookies=false}){
 const rates=new Map();return async(req,res,url)=>{
 if(!store)throw new ApiError(503,'COMMUNITY_UNAVAILABLE','Community storage is unavailable.');
 const account=identity?await identity(req):null;
 const cookie=Object.fromEntries((req.headers.cookie||'').split(';').map(s=>{const i=s.indexOf('=');return i<0?['','']:[s.slice(0,i).trim(),s.slice(i+1).trim()];}));let owner=account?'u:'+account.user.id:store.contributor(cookie.km_contributor);
 if(req.method==='POST'||req.method==='DELETE'){
 const now=Date.now();for(const[k,v]of rates)if(v.until<now)rates.delete(k);const key=req.socket.remoteAddress;const rate=rates.get(key)||{count:0,until:now+600000};if(++rate.count>30||rates.size>1000)throw new ApiError(429,'COMMUNITY_LIMIT','Too many community requests. Try again later.');rates.set(key,rate);
 }
 if(url.pathname==='/api/community/posts'&&req.method==='GET')return json(res,200,{posts:store.community.list(owner,boundedText(url.searchParams.get('q'),100)),storage:'local-prototype',supabaseConnected:false});
 if(url.pathname==='/api/community/posts'&&req.method==='POST'){const input=await readJson(req,16_384);if(input?.shared!==true)throw new ApiError(400,'COMMUNITY_CONSENT','Confirm sharing first.');const contributor=account?{id:owner}:store.ensureContributor(cookie.km_contributor);owner=contributor.id;const post=store.community.post(owner,input);if(contributor.token)res.setHeader('Set-Cookie',`km_contributor=${contributor.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${secureCookies?'; Secure':''}`);return json(res,201,{post});}
 const m=url.pathname.match(/^\/api\/community\/posts\/([0-9a-f-]{36})(?:\/(replies|status))?$/i);
 if(m){const[,id,action]=m;if(req.method==='GET'&&!action)return json(res,200,{post:store.community.get(id,owner)});if(!owner&&req.method==='DELETE')throw new ApiError(403,'COMMUNITY_OWNER','Only the author can remove this question.');if(req.method==='DELETE'&&!action)return json(res,200,store.community.remove(id,owner));if(req.method==='POST'&&action){const input=await readJson(req,16_384);if(action==='status')return json(res,200,{post:store.community.resolve(id,owner,input.resolved)});if(input.shared!==true)throw new ApiError(400,'COMMUNITY_CONSENT','Confirm sharing first.');const contributor=account?{id:owner}:store.ensureContributor(cookie.km_contributor);const post=store.community.reply(id,contributor.id,input,await externalStaff(req));if(contributor.token)res.setHeader('Set-Cookie',`km_contributor=${contributor.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${secureCookies?'; Secure':''}`);return json(res,201,{post});}}
 throw new ApiError(404,'COMMUNITY_NOT_FOUND','This community action is unavailable.');};
}
