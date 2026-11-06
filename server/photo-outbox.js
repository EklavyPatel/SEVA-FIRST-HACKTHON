import {mkdirSync,writeFileSync,renameSync,unlinkSync,readdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
// Durable metadata-only cleanup journal. No photo bytes, keys or owner identities.
export function openPhotoOutbox(directory=resolve('data/photo-outbox')) {
 mkdirSync(directory,{recursive:true,mode:0o700});
 const path=id=>resolve(directory,id+'.json');
 return {
  add(id,objectPath){const file=path(id);writeFileSync(file+'.tmp',JSON.stringify({id,objectPath,createdAt:Date.now()}),{mode:0o600});renameSync(file+'.tmp',file);},
  remove(id){try{unlinkSync(path(id));}catch(error){if(error.code!=='ENOENT')throw error;}},
  entries(){return readdirSync(directory).filter(name=>/^[0-9a-f-]{36}\.json$/.test(name)).map(name=>JSON.parse(readFileSync(resolve(directory,name),'utf8')));},
 };
}
