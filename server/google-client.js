import { ApiError } from './errors.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export function isGeminiSdkInstalled() {
  try { require.resolve('@google/genai'); return true; } catch { return false; }
}

export async function createGeminiClient({ apiKey, fetchImpl, loadSdk = () => import('@google/genai') }) {
  let GoogleGenAI;
  try { ({ GoogleGenAI } = await loadSdk()); }
  catch {
    throw new ApiError(503, 'SDK_UNAVAILABLE', 'AI સેટિંગમાં સમસ્યા છે. પછીથી પ્રયાસ કરો.');
  }
  return new GoogleGenAI({
    apiKey, vertexai: false,
    // No environment-derived proxy endpoint and no automatic paid request retries.
    httpOptions: {
      baseUrl: 'https://generativelanguage.googleapis.com', apiVersion: 'v1beta',
      timeout: 45_000, retryOptions: { attempts: 1 },
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    },
  });
}
