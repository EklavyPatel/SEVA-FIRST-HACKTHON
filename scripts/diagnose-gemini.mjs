import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { loadBackendEnvironment } from '../server/env.js';
import { createGeminiClient } from '../server/google-client.js';
import { inspectGeminiError } from '../server/gemini-diagnostics.js';

const environment = loadBackendEnvironment();
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
if (!/^[a-zA-Z0-9._-]{1,80}$/.test(model)) {
  console.error(JSON.stringify({ success: false, code: 'INVALID_MODEL_CONFIGURATION' }));
  process.exitCode = 1;
} else if (!environment.keyConfigured) {
  console.error(JSON.stringify({ success: false, code: 'AI_NOT_CONFIGURED' }));
  process.exitCode = 1;
} else {
  const require = createRequire(new URL('../server/google-client.js', import.meta.url));
  let sdkVersion = 'unavailable';
  try { sdkVersion = JSON.parse(readFileSync(resolve(dirname(require.resolve('@google/genai')), '../../package.json'), 'utf8')).version; } catch { /* SDK initialization reports failure below. */ }
  console.log(JSON.stringify({ event: 'gemini_configuration', keyConfigured: true, model, sdkVersion,
    endpoint: 'https://generativelanguage.googleapis.com/v1beta', timeoutMs: 45000, automaticRetries: false }));
  const requestId = randomUUID();
  const started = performance.now();
  let stage = 'sdk_initialization';
  try {
    const client = await createGeminiClient({ apiKey: process.env.GEMINI_API_KEY.trim() });
    stage = 'generate_content';
    const response = await client.models.generateContent({ model,
      contents: [{ role: 'user', parts: [{ text: 'Reply with the word OK.' }] }],
      config: { maxOutputTokens: 128, abortSignal: AbortSignal.timeout(45000) },
    });
    const success = Boolean(response.candidates?.[0]?.content?.parts?.some(part => !part.thought && part.text?.trim()));
    console.log(JSON.stringify({ event: 'gemini_text_probe', requestId, success, stage: 'response_validation', elapsedMs: Math.round(performance.now() - started) }));
    if (!success) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ event: 'gemini_text_probe', requestId, success: false, stage,
      elapsedMs: Math.round(performance.now() - started), ...inspectGeminiError(error) }));
    process.exitCode = 1;
  }
  // Always attempt the actual application image handler too, without mock responses.
  // Optional argv[2] is a real local JPEG; the default is explicitly an illustration.
  await import('./test-gemini.mjs');
}
