import {researchFields} from '../shared/research-fields.js';
import {ApiError} from './errors.js';
const invalid=()=>{throw new ApiError(400,'RESEARCH_INPUT','Please check the optional research details. You can leave any question blank.');};
export function normalizeFieldContext(raw){
 if(raw===undefined||raw===null)return{};
 if(typeof raw!=='object'||Array.isArray(raw))invalid();
 const result={};
 for(const f of researchFields){
  const value=raw[f.key];if(value===undefined||value===null||value==='')continue;
  if(f.type==='number'){
   if(!['string','number'].includes(typeof value))invalid();
   if(typeof value==='string'&&!value.trim())continue;
   const number=Number(value);if(!Number.isFinite(number)||number<f.min||number>f.max||(f.key!=='affectedPercent'&&!Number.isInteger(number)))invalid();result[f.key]=number;
  }else{
   if(typeof value!=='string'||value.length>(f.max||80)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value))invalid();
   const text=value.trim();if(!text)continue;
   if(f.options&&!f.options.some(o=>o[0]===text))invalid();
   if(f.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(text))||new Date(text).toISOString().slice(0,10)!==text))invalid();
   result[f.key]=text;
  }
 }
 if(raw.coordinates!==undefined&&raw.coordinates!==null){
  const c=raw.coordinates;if(typeof c!=='object'||Array.isArray(c)||raw.shareCoordinates!==true||typeof c.latitude!=='number'||typeof c.longitude!=='number'||!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||Math.abs(c.latitude)>90||Math.abs(c.longitude)>180)invalid();
  result.coordinates={latitude:Math.round(c.latitude*100)/100,longitude:Math.round(c.longitude*100)/100};result.shareCoordinates=true;
 }
 return result;
}
