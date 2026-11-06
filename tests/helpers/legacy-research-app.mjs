import {createResearchApi} from '../../server/research-api.js';
export function createLegacyResearchApp({researchStore,...options}={}) {
 const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 const readJson=async req=>{const chunks=[];for await(const c of req)chunks.push(c);return JSON.parse(Buffer.concat(chunks).toString());};
 const api=createResearchApi(researchStore,{readJson,json,secureCookies:options.secureCookies});
 return async(req,res)=>{try{if(req.headers.origin&&req.headers.origin!=='http://127.0.0.1:5173')return json(res,403,{error:{code:'ORIGIN_DENIED'}});await api(req,res,new URL(req.url,'http://127.0.0.1'));}catch(e){json(res,e.status||500,{error:{code:e.code,message:e.message}});}};
}
