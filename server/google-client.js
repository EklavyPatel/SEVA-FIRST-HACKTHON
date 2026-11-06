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
  let retryAfter;
  const client = new GoogleGenAI({
    apiKey, vertexai: false,
    // No environment-derived proxy endpoint and no automatic paid request retries.
    httpOptions: {
      baseUrl: 'https://generativelanguage.googleapis.com', apiVersion: 'v1beta',
      timeout: 45_000, retryOptions: { attempts: 1 },
      fetch: async (...args) => {
        const response = await (fetchImpl || globalThis.fetch)(...args);
        if (response.status === 429) retryAfter = response.headers.get('retry-after');
        return response;
      },
    },
  });
  // This SDK version discards response headers when constructing its ApiError.
  // Preserve only Retry-After, scoped to this per-analysis client, never raw headers.
  const generate = client.models.generateContent.bind(client.models);
  client.models.generateContent = async (...args) => {
    retryAfter = undefined;
    try { return await generate(...args); }
    catch (error) {
      if (error && typeof error === 'object' && Number(error.status) === 429) error.retryAfter = retryAfter;
      throw error;
    }
  };
  return client;
}
