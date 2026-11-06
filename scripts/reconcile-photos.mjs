import {resolve} from 'node:path';
import {loadBackendEnvironment} from '../server/env.js';
import {createSupabasePhotoStore} from '../server/supabase-photos.js';
import {openPhotoOutbox} from '../server/photo-outbox.js';
loadBackendEnvironment();
const store=createSupabasePhotoStore({url:process.env.SUPABASE_URL,publicKey:process.env.SUPABASE_PUBLISHABLE_KEY,serviceKey:process.env.SUPABASE_SERVICE_ROLE_KEY,outbox:openPhotoOutbox(resolve(process.env.DATA_DIRECTORY?.trim()||'data','photo-outbox'))});
if(!store){console.log(JSON.stringify({configured:false}));process.exitCode=1;}
else console.log(JSON.stringify(await store.reconcile())); // Counters only, never signed links or keys.
