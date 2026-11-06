// Public-key-only probes intentionally exercise anon, never an authenticated user.
export async function probeAnonymousDatabase({ url, publicKey, fetchImpl = fetch }) {
 const database = {};
 for (const [table, column] of [['km_account_roles','user_id'],['km_access_requests','id'],['km_access_request_history','id'],['km_community_posts','id'],['km_community_replies','id']]) {
  try {
   const response = await fetchImpl(`${url}/rest/v1/${table}?select=${column}&limit=0`, {
    headers: { apikey: publicKey }, redirect: 'error', signal: AbortSignal.timeout(10_000),
   });
   let body; try { body = await response.json(); } catch { body = null; }
   const code = ['PGRST205','42P01','42501'].includes(body?.code) ? body.code : undefined;
   const expectedDenial = [401,403].includes(response.status) && code === '42501';
   database[table] = { role: 'anon', status: response.status, ...(code ? {code} : {}),
    outcome: expectedDenial ? 'expected_denial' : response.ok ? 'unexpected_anonymous_access' : 'failure' };
  } catch {
   database[table] = {role:'anon', outcome:'failure', category:'network_or_response_failure'};
  }
 }
 return database;
}
