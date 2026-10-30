#!/usr/bin/env python3
"""Apply and test ONLY in an already-running, fresh, disposable local Supabase DB."""
import os
from pathlib import Path
import shutil
import subprocess
import sys

base = Path(__file__).resolve().parents[1]
if os.environ.get('KAPASMITRA_LOCAL_DISPOSABLE') != '1':
    sys.exit('Set KAPASMITRA_LOCAL_DISPOSABLE=1 only for a fresh disposable local Supabase stack.')
psql = shutil.which('psql')
if not psql:
    sys.exit('Cannot run: psql is not installed. No database connection was attempted.')
port = int(os.environ.get('KAPASMITRA_LOCAL_DB_PORT', '54322'))
if not 1 <= port <= 65535:
    sys.exit('Invalid local port')
# No connection URI accepted. Override libpq address/service/options settings.
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env.update(PGHOSTADDR='127.0.0.1', PGCONNECT_TIMEOUT='5',
           PGPASSWORD=os.environ.get('KAPASMITRA_LOCAL_DB_PASSWORD', 'postgres'))
args = [psql, '-X', '-w', '-h', '127.0.0.1', '-p', str(port), '-U', 'postgres', '-d', 'postgres',
        '-v', 'ON_ERROR_STOP=1']
preflight = """
do $$ begin
 if not exists(select 1 from pg_namespace where nspname='auth')
    or not exists(select 1 from pg_namespace where nspname='storage') then
   raise exception 'Expected a local Supabase database, not plain PostgreSQL'; end if;
 if exists(select 1 from pg_namespace where nspname='private')
    or exists(select 1 from pg_tables where schemaname='public')
    or exists(select 1 from auth.users) then
   raise exception 'Expected a fresh disposable local stack'; end if;
end $$;
"""
subprocess.run(args + ['-c', preflight], env=env, check=True)
for file in ['001_schema.sql', '002_access_and_storage.sql', 'tests/authorization.sql']:
    print(f'Local loopback database only: {file}', flush=True)
    subprocess.run(args + ['-f', str(base / file)], env=env, check=True)
print('Local migrations remain applied; test fixtures rolled back. Destroy the disposable stack when done.')
