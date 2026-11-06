import {loadBackendEnvironment} from '../server/env.js';
import {researchConfiguration,createResearchReadiness} from '../server/research-readiness.js';
import {createSupabasePhotoStore} from '../server/supabase-photos.js';
loadBackendEnvironment();
const options={publicAccess:process.env.PUBLIC_RESEARCH_ACCESS?.trim()==='true',url:process.env.SUPABASE_URL,publicKey:process.env.SUPABASE_PUBLISHABLE_KEY,serviceKey:process.env.SUPABASE_SERVICE_ROLE_KEY};
const configuration=researchConfiguration(options);
// Read-only metadata/RPC-denial probes. Never upload files, send emails or expose rows.
const store=createSupabasePhotoStore({...options,outbox:{add(){throw Error('Read-only check');},remove(){throw Error('Read-only check');},entries(){return [];}}});
const report=await createResearchReadiness({configuration,store})();
console.log(JSON.stringify(report,null,2));
if(!report.ready)process.exitCode=1;
