import { openResearchStore } from '../server/research-store.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import {createAuthenticatedApp as createApp} from './helpers/authenticated-app.mjs';
import { decodeImage } from '../server/image.js';
import { demoAnalysis } from '../server/demo.js';
import { renameAnalysis } from '../shared/analysis-language.js';
import { callHandler } from './http.js';
import { sdkMock, sdkResponse, sdkFailure } from './sdk-mock.js';
const sharp = (await import(createRequire(new URL('../server/package.json', import.meta.url)).resolve('sharp'))).default;
const jpeg = await readFile(new URL('./fixtures/cotton-illustration.jpg', import.meta.url));
const image = { mimeType: 'image/jpeg', base64: jpeg.toString('base64') };
const call = (app, body, path = '/api/analyze', headers = {}) => callHandler(app, { path, body, headers });
const live = (language = 'gu') => ({ mode: 'live', consent: true, language, image });
const gu = structuredClone(demoAnalysis);
gu.explanation_gu = 'પાન પર દેખાતાં ચિહ્નોનું કારણ આ ફોટાથી ચોક્કસ કહી શકાય તેમ નથી.';
gu.uncertainty.reason_gu = 'સ્પષ્ટ ફોટો અને કૃષિ નિષ્ણાતની સમીક્ષા જરૂરી છે.';
const en = { image_assessment: 'unclear', possibilities: [], visible_symptoms: [], explanation: 'The visible signs are insufficient to identify a cause.', uncertainty: { level: 'high', reason: 'A clearer image and expert review are needed.' } };

test('live inference requires server-side consent before any provider call', async () => {
 let calls = 0;
 const app = createApp({ apiKey: 'TEST ONLY', clientFactory: sdkMock(async () => { calls++; return sdkResponse(gu); }) });
 for (const consent of [undefined, false, 'true']) {
  const r = await call(app, { ...live(), consent });
  assert.equal(r.status, 400); assert.equal(r.body.error.code, 'ANALYSIS_CONSENT');
 }
 assert.equal(calls, 0);
});

test('disguised/truncated JPEG headers fail decoding before analysis and follow-up', async () => {
 let calls = 0;
 const app = createApp({ apiKey: 'TEST ONLY', clientFactory: sdkMock(async () => { calls++; return sdkResponse(gu); }) });
 const fake = { mimeType: 'image/jpeg', base64: Buffer.from([255,216,255,192,0,17,8,0,64,0,64,3,1,17,0,2,17,0,3,17,0,255,217]).toString('base64') };
 for (const path of ['/api/analyze', '/api/followup']) {
  const r = await call(app, { ...live(), image: fake, question: 'શું દેખાય છે?', history: [] }, path);
  assert.equal(r.status, 400); assert.equal(r.body.error.code, 'INVALID_IMAGE');
 }
 assert.equal(calls, 0);
});

test('server re-encodes uploads and removes EXIF before provider processing', async () => {
 const withExif = await sharp(jpeg).withMetadata({ exif: { IFD0: { Artist: 'ISOLATED TEST ONLY' } } }).jpeg().toBuffer();
 assert.ok((await sharp(withExif).metadata()).exif);
 const clean = await decodeImage({ mimeType: 'image/jpeg', base64: withExif.toString('base64') });
 assert.equal((await sharp(Buffer.from(clean.base64, 'base64')).metadata()).exif, undefined);
});

test('same upload follows server-controlled Gujarati/English prompts and rejects wrong-language output', async () => {
 for (const language of ['gu', 'en']) {
  let sent;
  const app = createApp({ apiKey: 'TEST ONLY', clientFactory: sdkMock(async options => { sent = options; return sdkResponse(language === 'gu' ? gu : en); }) });
  const r = await call(app, live(language));
  assert.equal(r.status, 200); assert.equal(r.body.language, language); assert.equal(r.body.persisted, false);
  assert.match(sent.config.systemInstruction, language === 'gu' ? /Gujarati script/ : /plain English/);
  assert.match(language === 'gu' ? r.body.analysis.explanation_gu : r.body.analysis.explanation, language === 'gu' ? /[\u0a80-\u0aff]/u : /visible/);
 }
 const app = createApp({ apiKey: 'TEST ONLY', clientFactory: sdkMock(async () => sdkResponse(renameAnalysis(en, 'gu'))) });
 const wrong = await call(app, live());
 assert.equal(wrong.status, 502); assert.equal(wrong.body.error.code, 'MODEL_LANGUAGE'); assert.ok(!wrong.body.analysis);
 assert.match(wrong.body.error.message, /ગુજરાતીમાં/);
});

test('Gujarati follow-up preserves language and rejects English answers, excessive history and dosages', async () => {
 const data = { image, language: 'gu', consent: true, question: 'હવે શું જોવું?', history: [] };
 let sent;
 const app = createApp({ apiKey: 'TEST ONLY', clientFactory: sdkMock(async options => { sent = options; return { text: 'દિવસના પ્રકાશમાં પાનની નીચેની બાજુ જુઓ. ચિહ્નો ક્યારથી દેખાય છે?', candidates: [{ finishReason: 'STOP' }] }; }) });
 const r = await call(app, data, '/api/followup');
 assert.equal(r.status, 200); assert.equal(r.body.language, 'gu'); assert.match(r.body.answer, /પાન/);
 assert.match(sent.config.systemInstruction, /Gujarati script/); assert.match(sent.contents[1].parts[0].text, /ગુજરાતીમાં/);
 const wrong = createApp({ apiKey: 'TEST ONLY', clientFactory: sdkMock(async () => ({ text: 'Inspect the leaves.', candidates: [{ finishReason: 'STOP' }] })) });
 assert.equal((await call(wrong, data, '/api/followup')).body.error.code, 'MODEL_LANGUAGE');
 const history = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'model' : 'user', text: 'test' }));
 assert.equal((await call(app, { ...data, history }, '/api/followup')).body.error.code, 'FOLLOWUP_INPUT');
});

test('Gujarati errors, unavailable service and safe unclear output do not fabricate diagnoses', async () => {
 const fallback = { image_assessment: 'unclear', possibilities: [], visible_symptoms_gu: [], explanation_gu: 'આ ફોટામાંથી સ્પષ્ટ અવલોકન થઈ શકતું નથી.', uncertainty: { level: 'high', reason_gu: 'દિવસના પ્રકાશમાં વધુ સ્પષ્ટ ફોટો લો.' } };
 const safe = await call(createApp({ apiKey: 'TEST ONLY', clientFactory: sdkMock(async () => sdkResponse(fallback)) }), live());
 assert.equal(safe.status, 200); assert.deepEqual(safe.body.analysis.possibilities, []);
 for (const status of [401, 403, 404, 429, 500, 504]) {
  const app = createApp({ apiKey: 'TEST ONLY', clientFactory: sdkFailure(status) });
  for (const path of ['/api/analyze', '/api/followup']) {
   const r = await call(app, { ...live(), question: 'હવે શું?', history: [] }, path);
   assert.ok(r.status >= 400); assert.match(r.body.error.message, /[\u0a80-\u0aff]/u); assert.ok(!r.body.analysis); assert.ok(!r.text.includes('TEST PRIVATE'));
  }
 }
});

test('forwarded addresses cannot reset guest inference limits', async () => {
 const app = createApp({ rateLimit: 1 });
 await call(app, live(), '/api/analyze', { 'x-forwarded-for': '192.0.2.1' });
 assert.equal((await call(app, live(), '/api/analyze', { 'x-forwarded-for': '192.0.2.2' })).status, 429);
});

test('cross-site origins, opaque origins and static private paths fail closed', async () => {
 const app = createApp();
 for (const origin of ['https://attacker.invalid', 'null']) assert.equal((await call(app, live(), '/api/analyze', { origin })).status, 403);
 for (const path of ['/data/research.sqlite', '/SEVA_HACKTHON.zip', '/api.env', '/server/index.js']) {
  assert.equal((await callHandler(app, { method: 'GET', path })).status, 404);
 }
});

test('Gujarati-number dosage and confidence bypasses are rejected in both model paths', async () => {
 for (const text of ['૧૦ ગ્રામ ઉમેરો.', '૧૦ લિટર વાપરો.', 'આ નિદાન ૯૯% ચોક્કસ છે.']) {
  const analysis = { ...gu, explanation_gu: text };
  const app = createApp({ apiKey: 'TEST ONLY', clientFactory: sdkMock(async () => sdkResponse(analysis)) });
  assert.equal((await call(app, live())).body.error.code, 'UNSAFE_MODEL_RESPONSE');
  const follow = createApp({ apiKey: 'TEST ONLY', clientFactory: sdkMock(async () => ({ text, candidates: [{ finishReason: 'STOP' }] })) });
  assert.equal((await call(follow, { ...live(), question: 'હવે શું?', history: [] }, '/api/followup')).body.error.code, 'FOLLOWUP_RESPONSE');
 }
});

test('distributable example environment files contain no credentials', async () => {
 for (const name of ['api.env.example', '.env.example', 'deploy.env.example']) {
  const text = await readFile(new URL('../' + name, import.meta.url), 'utf8');
  for (const match of text.matchAll(/^([A-Z_]*(?:KEY|TOKEN|PASSWORD|SECRET))=(.*)$/gm)) {
   assert.ok(!match[2].trim() || /^(?:your[-_].*|replace[-_].*)$/i.test(match[2].trim()), name + ': ' + match[1] + ' must be empty or an explicit placeholder');
  }
 }
});

test('concurrency limits reserve capacity before asynchronous body reads, including research uploads', async () => {
 const store = openResearchStore({path: ':memory:'});
 try {
  const app = createApp({researchStore: store});
  // Cloud photo concurrency is exercised in supabase-photos.test.mjs.
  const ai = await Promise.all(Array.from({length:3}, () => call(app, {mode:'invalid'})));
  assert.deepEqual(ai.map(r=>r.status).sort(), [400,400,429]);
  assert.equal((await call(app, {mode:'demo',image})).status,200, 'Capacity must be released after invalid requests');
 } finally {store.close();}
});
