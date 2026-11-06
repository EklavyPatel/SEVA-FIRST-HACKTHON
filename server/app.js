import { createSupabaseResearchApi } from './supabase-research-api.js';
import { createAnalysisReceipts } from './analysis-receipts.js';
import { createAccounts } from './accounts.js';
import { errorMessage } from './error-language.js';
import { answerFollowup } from './followup.js';
import { createCommunityApi } from './community.js';
import { createSupabaseCommunityApi } from './supabase-community.js';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { ApiError } from './errors.js';
import { decodeImage, MAX_BODY_BYTES } from './image.js';
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
async function readJson(req, maximum = MAX_BODY_BYTES) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new ApiError(415, 'CONTENT_TYPE', 'માન્ય ફોટો મોકલો.');
  if (Number(req.headers['content-length']) > maximum) throw new ApiError(413, 'BODY_TOO_LARGE', 'ફોટો ખૂબ મોટો છે.');
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maximum) throw new ApiError(413, 'BODY_TOO_LARGE', 'ફોટો ખૂબ મોટો છે.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); }
  catch { throw new ApiError(400, 'INVALID_JSON', 'વિનંતી વાંચી શકાઈ નથી. ફરી પ્રયાસ કરો.'); }
}

export function createApp({ apiKey = '', model = 'gemini-3.8-flash', enableDemo = true,
  appOrigin = 'http://127.0.0.1:5173', port = 3001, fetchImpl, clientFactory, rateLimit = 15, researchStore = null, supabaseUrl = '', supabasePublicKey = '', accountFetchImpl, photoStore, researchReadiness, secureCookies = false, communityStorage = 'supabase' } = {}) {
  const receipts = createAnalysisReceipts();
  const clients = new Map(); let active = 0;
  const sdkAvailable = Boolean(clientFactory || isGeminiSdkInstalled());
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`, new URL(appOrigin).host]);
  const allowedOrigins = new Set([appOrigin, `http://127.0.0.1:${port}`, `http://localhost:${port}`, `http://[::1]:${port}`]);
  const accounts = createAccounts({ url: supabaseUrl, publicKey: supabasePublicKey, fetchImpl: accountFetchImpl, secureCookies, appOrigin });
  const externalStaff = async req => {
    if (!accounts.configured) return null;
    const account = await accounts.identity(req);
    return account && ['admin','researcher','expert'].includes(account.user.role) && researchStore ? researchStore.externalResearcher(account.user) : null;
  };
  const communityApi = communityStorage==='sqlite'
    ? createCommunityApi(researchStore, { readJson, json, externalStaff, identity:req=>accounts.requireUser(req), secureCookies })
    : createSupabaseCommunityApi({accounts,readJson,json});
  const researchApi = createSupabaseResearchApi(photoStore || null,{readJson,json,identity:req=>accounts.identity(req),resolveAnalysis:(token,image)=>receipts.resolve(token,image),secureCookies});
  return async function handler(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self)');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    const requestId = randomUUID();
    const started = performance.now();
    let imageValidationMs;
    let requestLanguage = /^en(?:$|[-,;])/i.test(req.headers['accept-language'] || '') ? 'en' : 'gu';
    let holdsAiSlot = false;
    try {
      if (!allowedHosts.has(req.headers.host)) throw new ApiError(403, 'HOST_DENIED', 'આ વિનંતીને મંજૂરી નથી.');
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) throw new ApiError(403, 'ORIGIN_DENIED', 'આ વિનંતીને મંજૂરી નથી.');
      if (url.pathname === '/api/ready' && req.method === 'GET') {
        const research=researchReadiness?await researchReadiness():{ready:false,reason:'readiness_not_configured'};
        return json(res,research.ready?200:503,{ready:research.ready,research});
      }
      if (url.pathname === '/api/health' && req.method === 'GET') {
        return json(res, 200, { liveAvailable: Boolean(apiKey) && sdkAvailable, demoAvailable: enableDemo,
          persistence: Boolean(researchStore || photoStore), researchAvailable: Boolean(photoStore),
          services: {analysis:apiKey && sdkAvailable?'configured':'unconfigured',accounts:accounts.configured?'configured':'unconfigured',
            community:communityStorage==='sqlite'?(researchStore?'sqlite':'unavailable'):(accounts.configured?'supabase':'unconfigured'),photos:photoStore?'supabase':'unconfigured'},
          connectivityChecked:false,publicResearchAccess:false });
      }
      if (url.pathname.startsWith('/api/account/')) return await accounts.handle(req, res, url.pathname, { readJson: request => readJson(request, 16_384), json });
      if (url.pathname === '/api/analyze' || url.pathname === '/api/followup' || url.pathname.startsWith('/api/community/') || url.pathname.startsWith('/api/research/')) await accounts.requireUser(req);
      if (url.pathname.startsWith('/api/community/')) return await communityApi(req,res,url);
      if (url.pathname.startsWith('/api/research/')) return await researchApi(req, res, url);
      if (url.pathname === '/api/followup' && req.method === 'POST') {
        const now=Date.now();for(const[key,value]of clients)if(value.until<now)clients.delete(key);
        const key='chat:'+req.socket.remoteAddress;const usage=clients.get(key)||{count:0,until:now+600000};
        if(++usage.count>rateLimit||active>=2||clients.size>1000)throw new ApiError(429,'RATE_LIMIT','Too many questions. Please try again later.');clients.set(key,usage);
        active++; holdsAiSlot = true;
        const input=await readJson(req);requestLanguage = input?.language === 'en' ? 'en' : 'gu';if(input?.consent!==true)throw new ApiError(400,'FOLLOWUP_CONSENT','Consent to sending the photo and conversation to Gemini is required.');
        const image=await decodeImage(input.image);const controller=new AbortController();const close=()=>{if(!res.writableEnded)controller.abort();};res.on('close',close);
        try{return json(res,200,await answerFollowup(input,{apiKey,model,clientFactory,fetchImpl,image,signal:controller.signal}));}finally{res.off('close',close);}
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
        active++; holdsAiSlot = true;
        const input = await readJson(req);
        const language = input?.language ?? 'gu';
        requestLanguage = language === 'en' ? 'en' : 'gu';
        if (!['gu', 'en'].includes(language)) throw new ApiError(400, 'INVALID_LANGUAGE', 'ભાષા પસંદ કરો.');
        if (!['live', 'demo'].includes(input?.mode)) throw new ApiError(400, 'INVALID_MODE', 'વિશ્લેષણનો પ્રકાર પસંદ કરો.');
        if (input.mode === 'live' && input.consent !== true) throw new ApiError(400, 'ANALYSIS_CONSENT', 'Explicit consent to send this photo to Gemini is required.');
        const imageStarted = performance.now();
        const image = await decodeImage(input.image);
        imageValidationMs = Math.round((performance.now() - imageStarted) * 100) / 100;
        let analysis; let modelVersion=null;
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
          res.on('close', onClose);
          try { analysis = await analyzeWithGemini(image, { apiKey, model, fetchImpl, clientFactory, signal: controller.signal, language, onMetadata:metadata=>{modelVersion=metadata.modelVersion;} }); }
          finally { res.off('close', onClose); }
        }
        // Demo never receives real curated recommendations, even if a name happens to match.
        const advisories = input.mode === 'live' && analysis.image_assessment === 'cotton' ? findAdvisories(analysis.possibilities) : [];
        return json(res, 200, { id: requestId, mode: input.mode, modelVersion, model: input.mode === 'live' ? model : null,
          analysis, language, expertReviewRequired: true, advisories,
          ...(input.mode === 'live' ? {analysisReceipt:receipts.issue({data:Buffer.from(image.base64,'base64')},{result:analysis,model,version:modelVersion})} : {}),
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
      // Never log raw exceptions, provider messages, images, URLs, or credentials.
      if (known && (error.status >= 500 || error.diagnostics)) console.warn(JSON.stringify({
        event: req.url?.startsWith('/api/account/') ? 'account_request_failed' : req.url?.startsWith('/api/research/') ? 'research_request_failed' : 'analysis_request_failed', requestId, status: error.status, code: error.code,
        ...(error.diagnostics || {}), imageValidationMs,
        totalMs: Math.round(performance.now() - started),
      }));
      if (known && error.status === 429 && Number.isSafeInteger(error.retryAfterSeconds)) res.setHeader('Retry-After', String(error.retryAfterSeconds));
      json(res, known ? error.status : 500, { ...(req.url?.startsWith('/api/account/') ? { configured: accounts.configured } : {}), error: { code: known ? error.code : 'INTERNAL_ERROR',
        message: errorMessage(known ? error.code : 'INTERNAL_ERROR', known ? error.message : '', requestLanguage), requestId,
        ...(known && error.accountRate ? {...error.accountRate, automaticRetry:false} : {}),
        ...(known && error.code === 'AI_RATE_LIMIT' ? { quotaKind: error.quotaKind, retryAfterSeconds: error.retryAfterSeconds, automaticRetry: false } : {}) } });
    } finally { if (holdsAiSlot) active--; }
  };
}
