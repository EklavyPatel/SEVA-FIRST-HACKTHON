// Called only after the disposable-local guard in test-photos-sql.mjs succeeds.
import {spawn} from 'node:child_process';
export async function verifyConcurrentReviews({args,env}) {
 const applicant='68000000-0000-4000-8000-000000000001',admin='68000000-0000-4000-8000-000000000002',request='69000000-0000-4000-8000-000000000001';
 async function sql(source){return new Promise((resolve,reject)=>{const child=spawn('psql',[...args,'-v','VERBOSITY=verbose','-c',source],{env});let output='';child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});child.on('error',reject);child.on('close',code=>resolve({code,output}));});}
 const setup=await sql(`insert into auth.users(id,email,email_confirmed_at) values ('${applicant}','race-applicant@example.invalid',now()),('${admin}','race-admin@example.invalid',now());
 insert into public.km_account_roles values('${admin}','admin');
 insert into public.km_access_requests(id,user_id,kind,purpose,applicant_name,institution,intended_use) values('${request}','${applicant}','individual','Concurrent SQL fixture','Fixture','Fixture','Fixture');`);
 if(setup.code!==0)throw Error('Concurrent SQL fixtures could not be created.');
 try{
  const claims=`select set_config('request.jwt.claims','{"sub":"${admin}","role":"authenticated"}',true);set local role authenticated;`;
  const results=await Promise.all([
   sql(`begin;select id from public.km_access_requests where id='${request}' for update;${claims}select pg_sleep(0.3);select public.km_review_access_request('${request}','approved','',1);commit;`),
   sql(`begin;${claims}select public.km_review_access_request('${request}','rejected','Concurrent rejection',1);commit;`),
  ]);
  if(results.filter(r=>r.code===0).length!==1||!results.some(r=>r.code!==0&&r.output.includes('KM409')))throw Error('Concurrent decisions did not produce one winner and one conflict.');
  const verified=await sql(`do $$ declare approved boolean; begin
   select status='approved' into approved from public.km_access_requests where id='${request}';
   if (select count(*) from public.km_access_request_history where request_id='${request}')<>1 then raise exception 'Review history is not atomic';end if;
   if approved is distinct from exists(select 1 from public.km_account_roles where user_id='${applicant}' and role='researcher') then raise exception 'Role and decision differ';end if;
  end $$;`);
  if(verified.code!==0)throw Error('Concurrent review role/history verification failed.');
 }finally{
  const cleanup=await sql(`delete from public.km_access_requests where id='${request}';delete from public.km_account_roles where user_id in ('${applicant}','${admin}');delete from auth.users where id in ('${applicant}','${admin}');`);
  if(cleanup.code!==0)throw Error('Destroy the disposable database: concurrency fixture cleanup failed.');
 }
 console.log('Concurrent SQL review checks passed: one winner, one conflict, atomic role/history.');
}
