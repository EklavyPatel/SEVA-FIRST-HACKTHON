import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { ApiError } from './errors.js';
import { validateImage, MAX_BODY_BYTES } from './image.js';
import { analyzeWithGemini } from './gemini.js';
import { demoAnalysis } from './demo.js';
import { findAdvisories } from './advisories.js';
import { translator } from '../src/lib/i18n.js';
import { renameAnalysis } from '../shared/analysis-language.js';
import { isGeminiSdkInstalled } from './google-client.js';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg' };
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readJson(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new ApiError(415, 'CONTENT_TYPE', 'માન્ય ફોટો મોકલો.');
  if (Number(req.headers['content-length']) > MAX_BODY_BYTES) throw new ApiError(413, 'BODY_TOO_LARGE', 'ફોટો ખૂબ મોટો છે.');
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new ApiError(413, 'BODY_TOO_LARGE', 'ફોટો ખૂબ મોટો છે.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); }
  catch { throw new ApiError(400, 'INVALID_JSON', 'વિનંતી વાંચી શકાઈ નથી. ફરી પ્રયાસ કરો.'); }
}

export function createApp({ apiKey = '', model = 'gemini-3.8-flash', enableDemo = true,
  appOrigin = 'http://127.0.0.1:5173', port = 3001, fetchImpl, clientFactory, rateLimit = 15 } = {}) {
  const clients = new Map(); let active = 0;
  const sdkAvailable = Boolean(clientFactory || isGeminiSdkInstalled());
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, new URL(appOrigin).host]);
  const allowedOrigins = new Set([appOrigin, `http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  return async function handler(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    const requestId = randomUUID();
    try {
      if (!allowedHosts.has(req.headers.host)) throw new ApiError(403, 'HOST_DENIED', 'આ વિનંતીને મંજૂરી નથી.');
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) throw new ApiError(403, 'ORIGIN_DENIED', 'આ વિનંતીને મંજૂરી નથી.');
      if (url.pathname === '/api/health' && req.method === 'GET') {
        return json(res, 200, { liveAvailable: Boolean(apiKey) && sdkAvailable, demoAvailable: enableDemo, persistence: false });
      }
      if (url.pathname === '/api/analyze') {
        if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw new ApiError(405, 'METHOD', 'આ ક્રિયા ઉપલબ્ધ નથી.'); }
        const address = req.socket.remoteAddress; const now = Date.now();
        for (const [key, value] of clients) if (value.until < now) clients.delete(key);
        const usage = clients.get(address) || { count: 0, until: now + 10 * 60_000 };
        if (++usage.count > rateLimit || clients.size > 1000 || active >= 2) {
          res.setHeader('Retry-After', '60'); throw new ApiError(429, 'RATE_LIMIT', 'ઘણી વિનંતીઓ થઈ છે. થોડી વાર પછી પ્રયાસ કરો.');
        }
        clients.set(address, usage);
        const input = await readJson(req);
        const language = input?.language ?? 'gu';
        if (!['gu', 'en'].includes(language)) throw new ApiError(400, 'INVALID_LANGUAGE', 'ભાષા પસંદ કરો.');
        if (!['live', 'demo'].includes(input?.mode)) throw new ApiError(400, 'INVALID_MODE', 'વિશ્લેષણનો પ્રકાર પસંદ કરો.');
        const image = validateImage(input.image);
        let analysis;
        if (input.mode === 'demo') {
          if (!enableDemo) throw new ApiError(403, 'DEMO_DISABLED', 'ડેમો ઉપલબ્ધ નથી.');
          await new Promise(resolve => setTimeout(resolve, 650));
          const t = translator(language);
          const localizedDemo = {
            ...demoAnalysis,
            possibilities: demoAnalysis.possibilities.map(item => ({ ...item, name_gu: t(item.name_gu), evidence_gu: t(item.evidence_gu) })),
            visible_symptoms_gu: demoAnalysis.visible_symptoms_gu.map(t),
            explanation_gu: t(demoAnalysis.explanation_gu),
            uncertainty: { ...demoAnalysis.uncertainty, reason_gu: t(demoAnalysis.uncertainty.reason_gu) },
          };
          analysis = language === 'en' ? renameAnalysis(localizedDemo, 'en') : localizedDemo;
        } else {
          const controller = new AbortController();
          const onClose = () => { if (!res.writableEnded) controller.abort(); };
          res.on('close', onClose); active++;
          try { analysis = await analyzeWithGemini(image, { apiKey, model, fetchImpl, clientFactory, signal: controller.signal, language }); }
          finally { active--; res.off('close', onClose); }
        }
        // Demo never receives real curated recommendations, even if a name happens to match.
        const advisories = input.mode === 'live' && analysis.image_assessment === 'cotton' ? findAdvisories(analysis.possibilities) : [];
        return json(res, 200, { id: requestId, mode: input.mode, model: input.mode === 'live' ? model : null,
          analysis, language, expertReviewRequired: true, advisories,
          advisoryStatus: advisories.length ? 'reviewed_content_available' : 'unavailable', persisted: false });
      }
      if (url.pathname.startsWith('/api/')) throw new ApiError(404, 'NOT_FOUND', 'આ સેવા મળી નથી.');
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new ApiError(405, 'METHOD', 'આ ક્રિયા ઉપલબ્ધ નથી.');
      // Only the built client directory is served: .env, server code and migrations are inaccessible.
      const root = resolve('dist');
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { throw new ApiError(400, 'PATH', 'અમાન્ય સરનામું.'); }
      if (pathname.includes('..') || pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(p => p.startsWith('.'))) throw new ApiError(404, 'NOT_FOUND', 'પાનું મળ્યું નથી.');
      const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + '/')) throw new ApiError(404, 'NOT_FOUND', 'પાનું મળ્યું નથી.');
      let content;
      try { content = await readFile(file); }
      catch { throw new ApiError(404, 'NOT_FOUND', 'પાનું મળ્યું નથી. એપ્લિકેશન build થયેલી હોવી જોઈએ.'); }
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (res.destroyed || res.writableEnded) return;
      const known = error instanceof ApiError;
      if (known && error.status === 429) res.setHeader('Retry-After', '60');
      json(res, known ? error.status : 500, { error: { code: known ? error.code : 'INTERNAL_ERROR',
        message: known ? error.message : 'કંઈક ખોટું થયું. ફરીથી પ્રયાસ કરો.', requestId } });
    }
  };
}
