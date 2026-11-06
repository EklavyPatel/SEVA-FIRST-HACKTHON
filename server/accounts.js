import { accountConfiguration } from './account-config.js';
import { randomBytes, createHash } from 'node:crypto';
import { ApiError } from './errors.js';
import { accountRateError } from './account-rate-limit.js';
import { boundedText } from './research-store.js';

const digest = value => createHash('sha256').update(value).digest('hex');
const cookieName = 'km_account';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createAccounts({ url = '', publicKey = '', fetchImpl = globalThis.fetch, secureCookies = false, appOrigin = 'http://127.0.0.1:5173' } = {}) {
  const configuration = accountConfiguration({ url, publicKey });
  ({ url, publicKey } = configuration);
  const { configured } = configuration;
  const sessions = new Map(); const rates = new Map(); const identities = new WeakMap();
  const failure = () => new ApiError(503, 'ACCOUNT_UNAVAILABLE', 'Supabase is temporarily unavailable. Please try again later.');
  function token(req) {
    const raw = (req.headers.cookie || '').split(';').find(item => item.trim().startsWith(cookieName + '='))?.trim().slice(cookieName.length + 1);
    return /^[A-Za-z0-9_-]{43}$/.test(raw || '') ? raw : null;
  }
  function cookie(res, value, age) {
    res.setHeader('Set-Cookie', `${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secureCookies ? '; Secure' : ''}`);
  }
  function prune() { const now = Date.now(); for (const [id, session] of sessions) if (session.expires <= now) sessions.delete(id); }
  function limit(req) {
    const now = Date.now(); for (const [id, bucket] of rates) if (bucket.until <= now) rates.delete(id);
    const key = req.socket.remoteAddress; const bucket = rates.get(key) || { count: 0, until: now + 600_000 };
    if (++bucket.count > 15) throw accountRateError({source:'backend', seconds:Math.max(1,Math.ceil((bucket.until-now)/1000))});
    if (!rates.has(key) && rates.size >= 1000) throw accountRateError({source:'backend'});
    rates.set(key, bucket);
  }
  async function remote(path, { method = 'GET', body, accessToken } = {}) {
    if (!configured) throw failure();
    let response, data, text;
    try {
      response = await fetchImpl(url + path, { method, redirect: 'error', signal: AbortSignal.timeout(10_000), headers: {
        apikey: publicKey, ...(path.startsWith('/rest/v1/') ? { Prefer: 'return=representation' } : {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      text = response.status === 204 ? '' : await response.text();
    } catch (error) {
      const code = ['EAI_AGAIN','ENOTFOUND','ECONNREFUSED','ECONNRESET','ENETUNREACH'].includes(error?.cause?.code || error?.code) ? 'ACCOUNT_NETWORK' : ['TimeoutError','AbortError'].includes(error?.name) ? 'ACCOUNT_TIMEOUT' : 'ACCOUNT_NETWORK';
      throw new ApiError(503, code, code === 'ACCOUNT_TIMEOUT' ? 'Supabase did not respond in time. Please try again.' : 'The backend could not reach Supabase. Check DNS and the network connection.');
    }
    try { data = text ? JSON.parse(text) : null; }
    catch {
      if (response.status === 429) throw accountRateError({source:'supabase',providerCode:response.headers.get('x-sb-error-code'),providerStatus:429,retryAfter:response.headers.get('Retry-After')});
      throw new ApiError(502, 'ACCOUNT_RESPONSE', 'Supabase returned an unreadable response. Please try again later.');
    }
    if (!response.ok) {
      const code = data?.error_code || data?.code || response.headers.get('x-sb-error-code');
      if(path==='/rest/v1/rpc/km_community'){
        if(code==='KM404')throw new ApiError(404,'COMMUNITY_NOT_FOUND','This community question is unavailable.');
        if(code==='KM429')throw new ApiError(429,'COMMUNITY_LIMIT','Too many community requests or replies. Try again later.');
        if(code==='KM507')throw new ApiError(507,'COMMUNITY_FULL','The community has reached its capacity. Contact the project team.');
        if(code==='42501')throw new ApiError(403,'COMMUNITY_OWNER','Only the author can change this question.');
        if(['22023','23514','23502'].includes(code))throw new ApiError(400,'COMMUNITY_INPUT','Check the community form and sharing consent.');
      }
      if (response.status === 429) throw accountRateError({source:'supabase',providerCode:code,providerStatus:response.status,retryAfter:response.headers.get('Retry-After')});
      if (code === 'email_address_not_authorized') throw new ApiError(400, 'ACCOUNT_EMAIL_RECIPIENT', 'The configured email sender cannot send confirmation to this address. Ask the project owner to configure custom SMTP.', {providerCode:code,providerStatus:response.status});
      if (['PGRST205','PGRST202','42P01','42703','42883'].includes(code)) throw new ApiError(503, 'ACCOUNT_SCHEMA', 'Account database setup is incomplete. Apply the reviewed account migration and reload the Supabase schema cache.');
      if (path.startsWith('/rest/') && (response.status === 403 || code === '42501')) throw new ApiError(403, 'ACCOUNT_POLICY', 'Account database permission was denied. Check the reviewed RLS policies.');
      if (['23505','KM409'].includes(code)) throw new ApiError(409, 'ACCOUNT_CONFLICT', 'This application has already been submitted or reviewed. Refresh its status before trying again.');
      if (['otp_expired','otp_disabled','flow_state_expired','flow_state_not_found'].includes(code)) throw new ApiError(400, 'ACCOUNT_LINK', 'This email link expired or was already used. Request a new link.');
      if (code === 'email_not_confirmed') throw new ApiError(401, 'ACCOUNT_CONFIRMATION', 'Confirm your email before logging in.');
      if (code === 'invalid_credentials') throw new ApiError(401, 'ACCOUNT_CREDENTIALS', 'Incorrect email or password.');
      if (['user_already_exists','email_exists'].includes(code)) throw new ApiError(400, 'ACCOUNT_EXISTS', 'Unable to complete signup. If you already registered, confirm your email and log in.');
      if (['signup_disabled','email_provider_disabled'].includes(code)) throw new ApiError(503, 'ACCOUNT_PROVIDER_DISABLED', 'Email signup is disabled. Enable the email provider in Supabase Auth settings.');
      if (code === 'weak_password') throw new ApiError(400, 'ACCOUNT_PASSWORD', 'Choose a stronger password that meets the project password requirements.');
      if (['email_address_invalid','validation_failed'].includes(code)) throw new ApiError(400, 'ACCOUNT_INPUT', 'Check your email address and form details.');
      if (['PGRST301','PGRST303','bad_jwt','session_not_found','session_expired','user_not_found','user_banned'].includes(code) || (path === '/auth/v1/user' && response.status === 401)) throw new ApiError(401, 'ACCOUNT_SESSION', 'Your session expired. Please log in again.');
      if (response.status === 401 || (response.status === 403 && path.startsWith('/auth/'))) throw new ApiError(503, 'ACCOUNT_KEY', 'Supabase rejected the configured client key. Check SUPABASE_PUBLISHABLE_KEY.');
      if (response.status >= 500) throw failure();
      throw new ApiError(400, 'ACCOUNT_REQUEST', 'Account request failed. Check your form details and try again.');
    }
    return data;
  }
  async function identity(req) {
    if (identities.has(req)) return identities.get(req);
    prune(); const raw = token(req); const session = raw && sessions.get(digest(raw));
    if (!session) return null;
    // Verify the token and read protected roles on every protected action. Neither
    // user_metadata nor a role submitted by the browser is an authorization source.
    let user;
    try { user = await remote('/auth/v1/user', { accessToken: session.accessToken }); }
    catch (error) { if (error.code === 'ACCOUNT_SESSION') { sessions.delete(digest(raw)); return null; } throw error; }
    if (!uuid.test(user?.id || '') || !user.email_confirmed_at) { sessions.delete(digest(raw)); return null; }
    const roles = await remote(`/rest/v1/km_account_roles?select=role&user_id=eq.${user.id}`, { accessToken: session.accessToken });
    if (!Array.isArray(roles)) throw failure();
    const role = roles.some(row => row.role === 'admin') ? 'admin' : roles.some(row => row.role === 'expert') ? 'expert' : roles.some(row => row.role === 'researcher') ? 'researcher' : 'farmer';
    const account = { user: { id: user.id, email: user.email, role }, accessToken: session.accessToken };
    identities.set(req, account); return account;
  }
  async function requireUser(req) {
    const account = await identity(req);
    if (!account) throw new ApiError(401, 'ACCOUNT_AUTH', 'Log in with a confirmed account first.');
    return account;
  }
  async function handle(req, res, route, { readJson, json }) {
    if (route === '/api/account/me' && req.method === 'GET') {
      return json(res, 200, { configured, ...(!configured ? { configurationIssue: configuration.issue, missingConfiguration: configuration.missing } : {}), user: configured ? (await identity(req))?.user || null : null });
    }
    if (route === '/api/account/logout' && req.method === 'POST') {
      const raw = token(req); const session = raw && sessions.get(digest(raw));
      if (raw) sessions.delete(digest(raw)); cookie(res, '', 0);
      // Local logout takes effect even if Supabase cannot be reached.
      if (session) { try { await remote('/auth/v1/logout?scope=local', { method: 'POST', accessToken: session.accessToken }); } catch { /* Local cookie is already revoked. */ } }
      return json(res, 200, { signedOut: true });
    }
    if (!configured) throw new ApiError(503, 'ACCOUNT_CONFIGURATION', 'Configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in private api.env, then restart the backend.');
    if (req.method !== 'GET') limit(req);
    if (route === '/api/account/recover' && req.method === 'POST') {
      const input = await readJson(req); const email = boundedText(input?.email, 254, true).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'ACCOUNT_INPUT', 'Use a valid email address.');
      await remote('/auth/v1/recover?redirect_to=' + encodeURIComponent(new URL('/#/reset-password', appOrigin).href), { method: 'POST', body: { email } });
      return json(res, 202, { sent: true });
    }
    if (['/api/account/reset-password','/api/account/confirm'].includes(route) && req.method === 'POST') {
      const input = await readJson(req); const confirmation = route.endsWith('/confirm');
      const hashValid=typeof input?.tokenHash==='string'&&/^[a-zA-Z0-9_-]{20,512}$/.test(input.tokenHash);
      const accessValid=typeof input?.accessToken==='string'&&input.accessToken.length<=8192&&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(input.accessToken);
      if (input?.error || (!hashValid&&!accessValid) || (!confirmation && !['recovery','invite'].includes(input.type))) throw new ApiError(400, 'ACCOUNT_LINK', 'Use the complete link from your email, or request a new link.');
      if (!confirmation && (typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 128)) throw new ApiError(400, 'ACCOUNT_PASSWORD', 'New passwords must be 8–128 characters.');
      const verified = hashValid?await remote('/auth/v1/verify', { method:'POST', body:{ token_hash:input.tokenHash, type:confirmation?'email':input.type } }):{access_token:input.accessToken};
      if (!verified?.access_token) throw new ApiError(400, 'ACCOUNT_LINK', 'This email link expired or was already used. Request a new link.');
      try {
        const user = await remote('/auth/v1/user', { accessToken: verified.access_token });
        if (!uuid.test(user?.id || '') || !user.email_confirmed_at) throw new ApiError(401, 'ACCOUNT_CONFIRMATION', 'Confirm your email first.');
        if (!confirmation) await remote('/auth/v1/user', {method:'PUT',accessToken:verified.access_token,body:{password:input.password}});
      } finally { try { await remote('/auth/v1/logout?scope=local', {method:'POST',accessToken:verified.access_token}); } catch {} }
      const raw = token(req); if (raw) sessions.delete(digest(raw)); cookie(res,'',0);
      return json(res,200,confirmation?{confirmed:true}:{passwordUpdated:true});
    }
    if (['/api/account/login', '/api/account/signup'].includes(route) && req.method === 'POST') {
      const input = await readJson(req); const email = boundedText(input?.email, 254, true).toLowerCase(); const password = input?.password;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < (route.endsWith('/signup') ? 8 : 1) || password.length > 128) throw new ApiError(400, 'ACCOUNT_INPUT', 'Use a valid email and password. New passwords must be 8–128 characters.');
      if (route.endsWith('/signup')) {
        // Signup never accepts a role, admin flag, or institution authority.
        await remote('/auth/v1/signup?redirect_to=' + encodeURIComponent(new URL('/#/login', appOrigin).href), { method: 'POST', body: { email, password } });
        return json(res, 202, { confirmationRequired: true });
      }
      prune(); if (sessions.size >= 1000) throw failure();
      const data = await remote('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
      if (typeof data?.access_token !== 'string' || !data.access_token || !data.user || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new ApiError(502, 'ACCOUNT_RESPONSE', 'Supabase returned an incomplete login response. Please try again later.');
      if (!data.user.email_confirmed_at) throw new ApiError(401, 'ACCOUNT_CONFIRMATION', 'Confirm your email before logging in.');
      const previous = token(req); if (previous) sessions.delete(digest(previous));
      const next = randomBytes(32).toString('base64url'); const age = Math.min(3600, Math.floor(data.expires_in));
      sessions.set(digest(next), { accessToken: data.access_token, expires: Date.now() + age * 1000 });
      cookie(res, next, age); return json(res, 200, { signedIn: true });
    }
    const account = await requireUser(req);
    if (route === '/api/account/requests' && req.method === 'GET') {
      const query = new URL(req.url, appOrigin).searchParams;
      const scope = query.get('scope') || 'mine';
      if (!['mine','admin'].includes(scope)) throw new ApiError(400,'ACCOUNT_INPUT','Choose an application list.');
      if (scope === 'admin' && account.user.role !== 'admin') throw new ApiError(403,'ACCOUNT_ADMIN','Administrator access is required.');
      const status = query.get('status') || 'pending';
      const offset=Number(query.get('offset')||0);
      if(!Number.isSafeInteger(offset)||offset<0||offset>10000)throw new ApiError(400,'ACCOUNT_INPUT','Choose a valid page.');
      if (!['pending','reviewed','all'].includes(status)) throw new ApiError(400,'ACCOUNT_INPUT','Choose an application status.');
      const filter = scope === 'admin' ? (status === 'pending' ? '&status=eq.pending' : status === 'reviewed' ? '&status=neq.pending' : '') + '&order=created_at.asc' : `&user_id=eq.${account.user.id}&order=created_at.desc`;
      const rows = await remote('/rest/v1/km_access_requests?select=id,user_id,kind,applicant_name,institution,purpose,intended_use,status,review_reason,revision,created_at,updated_at,reviewed_at,reviewed_by&limit=25&offset=' + offset + filter, account);
      if (!Array.isArray(rows)) throw new ApiError(502, 'ACCOUNT_RESPONSE', 'Supabase returned an unreadable request collection.');
      const history = await remote('/rest/v1/km_access_request_history?select=id,request_id,revision,event,applicant_name,institution,purpose,intended_use,reason,reviewer_user_id,created_at&order=created_at.asc&limit=1000' + (scope === 'mine' ? '&user_id=eq.'+account.user.id : rows.length ? '&request_id=in.('+rows.map(row=>row.id).join(',')+')' : '&request_id=eq.00000000-0000-0000-0000-000000000000'), account);
      if (!Array.isArray(history)) throw failure();
      return json(res, 200, { requests: rows.map(row=>({...row,history:history.filter(event=>event.request_id===row.id)})), limit:25,offset,hasMore:rows.length===25 });
    }
    if (route === '/api/account/requests' && req.method === 'POST') {
      const input = await readJson(req);
      if (!['individual', 'university'].includes(input?.kind) || input?.consent !== true) throw new ApiError(400, 'ACCOUNT_INPUT', 'Choose an applicant type and confirm sharing your request with administrators.');
      await remote('/rest/v1/rpc/km_submit_access_request', { ...account, method: 'POST', body: {
        applicant_kind: input.kind, applicant_name: boundedText(input.name, 150, true), applicant_institution: boundedText(input.institution, 150, true),
        applicant_purpose: boundedText(input.purpose, 1500, true), applicant_intended_use: boundedText(input.intendedUse, 1500, true),
      } });
      return json(res, 201, { submitted: true });
    }
    if (route === '/api/account/review' && req.method === 'POST') {
      if (account.user.role !== 'admin') throw new ApiError(403, 'ACCOUNT_ADMIN', 'Administrator access is required.');
      const input = await readJson(req);
      if (!uuid.test(input?.id || '') || !['approved', 'rejected', 'revoked'].includes(input?.decision) || !Number.isSafeInteger(input?.revision) || input.revision < 1) throw new ApiError(400, 'ACCOUNT_INPUT', 'Choose a request and decision.');
      await remote('/rest/v1/rpc/km_review_access_request', { ...account, method: 'POST', body: { request_id: input.id, decision: input.decision, review_reason:boundedText(input.reason,1500,input.decision !== 'approved'), expected_revision:input.revision } });
      return json(res, 200, { reviewed: true });
    }
    throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'This account action is unavailable.');
  }
  return { configured, handle, identity, requireUser, remote };
}
