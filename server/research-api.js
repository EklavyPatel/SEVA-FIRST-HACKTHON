import { normalizeFieldContext } from './research-context.js';
import sharp from 'sharp';
import { ApiError } from './errors.js';
import { validateImage } from './image.js';
import { CONSENT_VERSION, PARTS, boundedText } from './research-store.js';

const ownerCookie = 'km_contributor'; const staffCookie = 'km_research';
function cookies(req) {
  const result = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const index = part.indexOf('='); if (index > 0) result[part.slice(0,index).trim()] = part.slice(index+1).trim();
  }
  return result;
}
function setCookie(res, name, value, maxAge, secure = false) {
  res.setHeader('Set-Cookie', `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
}
export async function normalizeResearchImage(input) {
  const validated = validateImage(input);
  try {
    const { data, info } = await sharp(Buffer.from(validated.base64, 'base64'), { limitInputPixels: 12_000_000, failOn: 'error' })
      .rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#fff' }).jpeg({ quality: 88 }).timeout({ seconds: 8 }).toBuffer({ resolveWithObject: true });
    if (info.width < 64 || info.height < 64 || data.length > 3*1024*1024) throw new Error();
    return { data, width: info.width, height: info.height };
  } catch { throw new ApiError(400, 'RESEARCH_IMAGE', 'This photo could not be decoded. Please choose a clear JPG, PNG, or WebP photo.'); }
}
export function createResearchApi(store, { readJson, json, externalStaff = async () => null, secureCookies = false }) {
  const limits = new Map(); let activeUploads = 0;
  function limit(req, name, maximum) {
    const now = Date.now(); for (const [key,value] of limits) if (value.until < now) limits.delete(key);
    const key = `${name}:${req.socket.remoteAddress}`; const bucket = limits.get(key) || { count: 0, until: now+10*60_000 };
    if (++bucket.count > maximum || limits.size > 1000) throw new ApiError(429, 'RESEARCH_RATE', 'Too many research requests. Please try again in ten minutes.');
    limits.set(key,bucket);
  }
  return async (req,res,url) => {
    if (!store) throw new ApiError(503, 'RESEARCH_UNAVAILABLE', 'Research storage is not available.');
    const cookie = cookies(req); const owner = store.contributor(cookie[ownerCookie]); const staff = store.researcher(cookie[staffCookie]) || await externalStaff(req);
    const needsStaff = () => { if (!staff) throw new ApiError(401, 'RESEARCH_AUTH', 'Sign in with an authorized researcher account.'); return staff; };
    if (url.pathname === '/api/research/me' && req.method === 'GET') return json(res,200,{ available:true, consentVersion:CONSENT_VERSION, stats:store.stats(owner), researcher:staff });
    if (url.pathname === '/api/research/login' && req.method === 'POST') {
      limit(req,'login',8); const input = await readJson(req,16_384); const session = await store.login(input?.username,input?.password);
      setCookie(res,staffCookie,session.token,8*60*60,secureCookies); return json(res,200,{ researcher:session.researcher });
    }
    if (url.pathname === '/api/research/logout' && req.method === 'POST') {
      store.logout(cookie[staffCookie]); setCookie(res,staffCookie,'',0,secureCookies); return json(res,200,{ signedOut:true });
    }
    if (url.pathname === '/api/research/contributions') {
      if (req.method === 'GET') {
        const scope = url.searchParams.get('scope') || 'mine';
        if (!['mine','dataset'].includes(scope)) throw new ApiError(400,'RESEARCH_INPUT','Choose a research collection.');
        if (scope === 'dataset') needsStaff();
        const status = url.searchParams.get('status') || 'all'; const part = url.searchParams.get('part') || 'all';
        const offset = Number(url.searchParams.get('offset') || 0);
        if (!['all','reviewed','unreviewed'].includes(status) || !['all',...PARTS].includes(part) || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) throw new ApiError(400,'RESEARCH_INPUT','Please check the research filters.');
        return json(res,200,store.list({ ...(scope === 'mine' ? {owner} : {}), q:boundedText(url.searchParams.get('q'),100), status,part,offset }));
      }
      if (req.method === 'POST') {
        limit(req,'upload',30); if (activeUploads >= 2) throw new ApiError(429,'RESEARCH_RATE','Photo preparation is busy. Please try again.');
        activeUploads++;
        try {
          const input = await readJson(req);
          if (input?.consent?.accepted !== true || input?.consent?.version !== CONSENT_VERSION) throw new ApiError(400,'RESEARCH_CONSENT','Explicit research consent is required for this photo.');
          // Validate metadata before decoding or allocating an owner identity.
          boundedText(input.details?.district,80); boundedText(input.details?.symptoms,1000);
          normalizeFieldContext(input.details?.fieldContext);
          if (!PARTS.includes(input.details?.plantPart || 'unknown')) throw new ApiError(400,'RESEARCH_INPUT','Choose the affected plant part.');
          const image = await normalizeResearchImage(input.image);
          const identity = store.ensureContributor(cookie[ownerCookie]);
          const saved = store.save({ owner:identity.id, requestKey:input.requestKey, image, details:input.details });
          if (identity.token) setCookie(res,ownerCookie,identity.token,365*24*60*60,secureCookies);
          return json(res,saved.duplicate ? 200 : 201,saved);
        } finally { activeUploads--; }
      }
    }
    if (url.pathname === '/api/research/export.csv' && req.method === 'GET') {
      needsStaff(); limit(req,'export',15);
      res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Cache-Control':'no-store','Content-Disposition':'attachment; filename="cotton-research-labels.csv"'});return res.end(store.exportCsv());
    }
    const match = url.pathname.match(/^\/api\/research\/photos\/([0-9a-f-]{36})(?:\/(image|reviews))?$/i);
    if (match) {
      const [,id,action] = match;
      if (action === 'image' && ['GET','HEAD'].includes(req.method)) {
        const data = store.image(id,{owner,staff});
        res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store','Content-Length':data.length});return res.end(req.method === 'HEAD' ? undefined : data);
      }
      if (action === 'reviews' && req.method === 'POST') {
        needsStaff();limit(req,'review',60); const input=await readJson(req);return json(res,201,{photo:store.review(id,staff,input)});
      }
      if (!action && req.method === 'GET') return json(res,200,{photo:store.photo(id,{owner,staff})});
      if (!action && req.method === 'DELETE') { if (!owner) throw new ApiError(404,'RESEARCH_NOT_FOUND','This research photo is unavailable.');return json(res,200,store.withdraw(id,owner)); }
    }
    throw new ApiError(404,'RESEARCH_NOT_FOUND','This research action is unavailable.');
  };
}
