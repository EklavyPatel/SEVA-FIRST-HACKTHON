// No credential values leave this function in public diagnostics.
export function accountConfiguration({ url = '', publicKey = '' } = {}) {
  url = typeof url === 'string' ? url.trim() : '';
  publicKey = typeof publicKey === 'string' ? publicKey.trim() : '';
  const missing = [];
  if (!url) missing.push('SUPABASE_URL');
  if (!publicKey) missing.push('SUPABASE_PUBLISHABLE_KEY');
  let issue = missing.length ? 'missing_variables' : null;
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.port) issue = 'invalid_project_url';
      else url = parsed.origin;
    } catch { issue = 'invalid_project_url'; }
  }
  if (publicKey.startsWith('sb_secret_')) issue = 'elevated_key';
  if (publicKey.split('.').length === 3) {
    try {
      if (JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url')).role !== 'anon') issue = 'invalid_client_key';
    } catch { issue = 'invalid_client_key'; }
  } else if (publicKey && !publicKey.startsWith('sb_publishable_')) {
    issue ||= 'invalid_client_key';
  }
  return { url, publicKey, configured: !issue, issue, missing };
}
