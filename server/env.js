import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

// Only backend entry points call this. Never load secrets into the Vite process.
// Existing nonempty process environment > api.env > .env defaults.
export function loadBackendEnvironment({ cwd = process.cwd(), env = process.env } = {}) {
  const loadedFiles = [];
  for (const file of ['api.env', '.env']) {
    let values;
    try { values = parseEnv(readFileSync(resolve(cwd, file), 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') continue;
      // Do not include file contents or original parser errors in output.
      throw new Error('Backend environment configuration could not be read.');
    }
    loadedFiles.push(file);
    for (const [key, value] of Object.entries(values)) {
      if ((!env[key] || !env[key].trim()) && value.trim()) env[key] = value;
    }
  }
  return { loadedFiles, keyConfigured: Boolean(env.GEMINI_API_KEY?.trim()) };
}
