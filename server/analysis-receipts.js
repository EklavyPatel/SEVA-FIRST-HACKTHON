import {createHash,randomBytes} from 'node:crypto';
import {ApiError} from './errors.js';
const digest=value=>createHash('sha256').update(value).digest('hex');
// Temporary AI results only; never store photo bytes. Receipts cannot forge AI provenance.
export function createAnalysisReceipts({ttl=30*60_000,maximum=200}={}) {
 const entries=new Map();
 const prune=()=>{for(const[k,v]of entries)if(v.until<=Date.now())entries.delete(k);};
 return {
  issue(image,result){prune();while(entries.size>=maximum)entries.delete(entries.keys().next().value);const token=randomBytes(32).toString('base64url');entries.set(digest(token),{imageHash:digest(image.data),result,until:Date.now()+ttl});return token;},
  resolve(token,image){if(!token)return null;prune();const row=typeof token==='string'&&entries.get(digest(token));if(!row||row.imageHash!==digest(image.data))throw new ApiError(409,'RESEARCH_ANALYSIS_EXPIRED','The temporary analysis receipt expired or does not match this photo. Run analysis again, or save without attaching AI suggestions.');return structuredClone(row.result);},
 };
}
