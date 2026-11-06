// Explicit disposable LOCAL Supabase only. No connection URL is accepted.
import {spawnSync} from 'node:child_process';
import {verifyConcurrentReviews} from './approval-concurrency.mjs';
if(process.env.KAPASMITRA_DISPOSABLE_DB!=='1')throw new Error('Set KAPASMITRA_DISPOSABLE_DB=1 only for a fresh disposable local Supabase stack.');
const port=Number(process.env.KAPASMITRA_LOCAL_DB_PORT||54322);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid local port.');
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('PG')));
Object.assign(env,{PGHOSTADDR:'127.0.0.1',PGCONNECT_TIMEOUT:'5',PGPASSWORD:process.env.KAPASMITRA_LOCAL_DB_PASSWORD||'postgres'});
const args=['-X','-w','-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'];
function run(extra){const result=spawnSync('psql',[...args,...extra],{env,stdio:'inherit'});if(result.error)throw new Error('Local SQL test requires psql and a disposable local Supabase stack.');if(result.status!==0)process.exit(result.status||1);}
run(['-c',`do $$ begin
 if not exists(select 1 from pg_namespace where nspname='auth') or not exists(select 1 from pg_namespace where nspname='storage') then raise exception 'Expected local Supabase';end if;
 if exists(select 1 from auth.users) or exists(select 1 from pg_tables where schemaname='public') then raise exception 'Expected a fresh disposable database';end if;
end $$;`]);
for(const file of ['supabase/migrations/202611040001_account_access.sql','supabase/migrations/202611040002_private_crop_photos.sql','supabase/tests/photo-authorization.sql','supabase/migrations/202611040003_public_research_browsing.sql','supabase/migrations/202611060001_complete_account_approval.sql','supabase/migrations/202611060002_supabase_community.sql','supabase/tests/complete-account-flow.sql'])run(['-f',file]);
await verifyConcurrentReviews({args,env});
console.log('Local SQL checks passed; fixtures rolled back. Destroy the disposable stack after review.');
