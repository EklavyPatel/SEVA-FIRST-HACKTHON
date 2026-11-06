import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { loadBackendEnvironment } from '../server/env.js';
import { accountConfiguration } from '../server/account-config.js';
import { probeAnonymousDatabase } from './backend-probe.mjs';

// Only nonsecret state, variable names and allowlisted failure categories are printed.
const loaded = loadBackendEnvironment();
const config = accountConfiguration({ url: process.env.SUPABASE_URL, publicKey: process.env.SUPABASE_PUBLISHABLE_KEY });
let example = {};
try { example = parseEnv(readFileSync('api.env.example', 'utf8')); } catch { /* Optional. */ }
const report = {
 loadedFiles: loaded.loadedFiles, configSources: loaded.configSources, precedence: 'process environment > api.env > .env',
 geminiKeyPresent: Boolean(process.env.GEMINI_API_KEY?.trim()), geminiModelPresent: Boolean(process.env.GEMINI_MODEL?.trim()),
 accountsConfigured: config.configured, configurationIssue: config.issue, missingConfiguration: config.missing,
 settingsOnlyInExample: config.missing.filter(key => example[key]?.trim()),
};
if (config.configured) {
 try {
  const response = await fetch(config.url + '/auth/v1/settings', {
   headers: {apikey:config.publicKey}, redirect:'error', signal:AbortSignal.timeout(10_000),
  });
  const data = await response.json();
  report.supabaseAuth = {status:response.status};
  if (response.ok) {
   for (const name of ['disable_signup','mailer_autoconfirm']) if (typeof data[name] === 'boolean') report.supabaseAuth[name] = data[name];
   if (typeof data.external?.email === 'boolean') report.supabaseAuth.emailEnabled = data.external.email;
  } else report.supabaseAuth.category = response.status === 401 || response.status === 403 ? 'client_key_rejected' : 'provider_error';
  if (response.ok) {
   report.database = await probeAnonymousDatabase({url:config.url, publicKey:config.publicKey});
   report.authenticatedFlow = {outcome:'not_tested', reason:'Anonymous probes do not verify user tokens or authenticated RLS.'};
  }
 } catch (error) {
  const code = error?.cause?.code || error?.code;
  report.supabaseAuth = {category:['EAI_AGAIN','ENOTFOUND'].includes(code)?'dns_failure':['TimeoutError','AbortError'].includes(error?.name)?'timeout':'network_or_response_failure',...( ['EAI_AGAIN','ENOTFOUND','ECONNREFUSED','ECONNRESET'].includes(code)?{code}:{})};
 }
}
console.log(JSON.stringify(report,null,2));
if (!config.configured || report.supabaseAuth?.status !== 200 || Object.values(report.database || {}).some(check => check.outcome !== 'expected_denial')) process.exitCode = 1;
