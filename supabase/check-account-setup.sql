-- READ ONLY. Run in the chosen project's SQL Editor before applying migrations.
-- No account identities, passwords, tokens, or research records are selected.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('km_account_roles','km_access_requests','km_access_request_history','km_community_posts','km_community_replies');

select tablename,policyname,cmd,roles,qual,with_check
from pg_catalog.pg_policies
where schemaname='public' and tablename in ('km_account_roles','km_access_requests')
order by tablename,policyname;

select routine_name,grantee,privilege_type
from information_schema.routine_privileges
where routine_schema='public' and routine_name in ('km_is_admin','km_submit_access_request','km_review_access_request','km_withdraw_own_photo','km_community');

select table_name,column_name,grantee,privilege_type
from information_schema.column_privileges
where table_schema='public' and table_name in ('km_account_roles','km_access_requests')
  and grantee in ('anon','authenticated')
order by table_name,grantee,column_name,privilege_type;
