import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import {createAuthenticatedApp as createApp} from './helpers/authenticated-app.mjs';
import { validateImage, MAX_IMAGE_BYTES } from '../server/image.js';
import { validateAnalysis, analyzeWithGemini } from '../server/gemini.js';
import { demoAnalysis } from '../server/demo.js';
import { findAdvisories } from '../server/advisories.js';
import { sdkMock, sdkResponse, sdkFailure } from './sdk-mock.js';
import { createGeminiClient } from '../server/google-client.js';
import { loadBackendEnvironment } from '../server/env.js';
import { inspectGeminiError } from '../server/gemini-diagnostics.js';
import { quotaGuidance } from '../server/gemini-quota.js';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Synthetic JPEG header for API validation tests, NOT a real crop photo or decodable fixture.
const header = Buffer.from([0xff,0xd8,0xff,0xc0,0,17,8,0,64,0,64,3,1,0x11,0,2,0x11,0,3,0x11,0,0xff,0xd9]);
const image = { mimeType: 'image/jpeg', base64: readFileSync(new URL('./fixtures/cotton-illustration.jpg', import.meta.url)).toString('base64') };
const secret = 'test-server-only-secret';
const mockAnalysis = () => structuredClone(demoAnalysis);
const mockGoogle = value => async () => sdkResponse(value);

// In-memory HTTP adapter: runs the real request handler without binding a network socket.
async function request(app, { path = '/api/analyze', method = 'POST', body = { mode: 'demo', image }, headers = {} } = {}) {
  const req = Readable.from(method === 'POST' ? [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))] : []);
  req.method = method; req.url = path;
  req.headers = { host: '127.0.0.1:3001', 'content-type': 'application/json', origin: 'http://127.0.0.1:5173', ...headers };
  req.socket = { remoteAddress: '127.0.0.1' };
  const chunks = []; const responseHeaders = {};
  const res = new Writable({ write(chunk, encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
  res.setHeader = (key, value) => { responseHeaders[key.toLowerCase()] = value; };
  res.writeHead = (status, values = {}) => { res.statusCode = status; for (const [key,value] of Object.entries(values)) res.setHeader(key,value); };
  await app(req, res); await finished(res);
  const text = Buffer.concat(chunks).toString();
  return { status: res.statusCode, headers: responseHeaders, text, body: responseHeaders['content-type']?.startsWith('application/json') ? JSON.parse(text) : text };
}

test('health exposes capabilities, never keys', async () => {
  const res = await request(createApp({ apiKey: secret, clientFactory: sdkMock(mockGoogle(mockAnalysis())) }), { path: '/api/health', method: 'GET' });
  assert.equal(res.status, 200); assert.equal(res.body.liveAvailable, true);
  assert.equal(res.text.includes(secret), false); assert.equal(res.body.persistence, false);
});
test('explicit demo works and never calls Google or returns treatment content', async () => {
  const res = await request(createApp({ clientFactory: () => { throw Error('must not call'); } }));
  assert.equal(res.status, 200); assert.equal(res.body.mode, 'demo');
  assert.equal(res.body.model, null); assert.equal(res.body.persisted, false);
  assert.deepEqual(res.body.advisories, []); assert.match(res.body.analysis.explanation_gu, /સિમ્યુલેશન/);
});
test('live without key fails explicitly and never silently falls back to demo', async () => {
  const res = await request(createApp(), { body: { mode: 'live', consent: true, image } });
  assert.equal(res.status, 503); assert.equal(res.body.error.code, 'AI_NOT_CONFIGURED');
});
test('live integration sends image and structured-output config through the SDK interface', async () => {
  let called = false;
  const app = createApp({ apiKey: secret, clientFactory: async options => {
    assert.equal(options.apiKey, secret);
    return { models: { generateContent: async request => {
      called = true;
      assert.equal(request.model, 'gemini-3.8-flash');
      assert.ok(validateImage({ mimeType: 'image/jpeg', base64: request.contents[0].parts[1].inlineData.data }));
      assert.equal(request.config.responseMimeType, 'application/json');
      assert.match(request.config.systemInstruction, /Never give treatments/);
      assert.ok(request.config.abortSignal instanceof AbortSignal);
      return sdkResponse(mockAnalysis());
    } } };
  } });
  const res = await request(app, { body: { mode: 'live', consent: true, image } });
  assert.equal(called, true); assert.equal(res.status, 200); assert.equal(res.body.mode, 'live');
  assert.equal(res.text.includes(secret), false); assert.equal(res.body.expertReviewRequired, true);
});
test('malicious origins and Host rebinding are rejected before inference', async () => {
  const app = createApp();
  assert.equal((await request(app, { headers: { origin: 'https://attacker.invalid' } })).status, 403);
  assert.equal((await request(app, { headers: { host: 'attacker.invalid:3001' } })).status, 403);
});
test('missing mode, non-JSON body, invalid JSON and oversize request rejected', async () => {
  const app = createApp();
  assert.equal((await request(app, { body: { image } })).status, 400);
  assert.equal((await request(app, { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await request(app, { body: '{' })).status, 400);
  assert.equal((await request(app, { headers: { 'content-length': String(5 * 1024 * 1024) } })).status, 413);
});
test('image validation checks actual header, dimensions, canonical base64 and size', () => {
  assert.equal(validateImage({ ...image, base64: header.toString('base64') }).width, 64);
  assert.throws(() => validateImage({ ...image, mimeType: 'image/svg+xml' }));
  assert.throws(() => validateImage({ ...image, base64: Buffer.from('not a jpeg').toString('base64') }));
  assert.throws(() => validateImage({ ...image, base64: image.base64 + '!' }));
  assert.throws(() => validateImage({ ...image, base64: 'a'.repeat(Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4) }));
  const huge = Buffer.from(header); huge.writeUInt16BE(9000, 9);
  assert.throws(() => validateImage({ ...image, base64: huge.toString('base64') }));
});
test('rate limiting returns a retry hint', async () => {
  const app = createApp({ rateLimit: 1 });
  await request(app, { body: { mode: 'live', consent: true, image } });
  const res = await request(app); assert.equal(res.status, 429); assert.equal(res.headers['retry-after'], '60');
});
test('provider credentials/errors are redacted and network failures are controlled', async () => {
  const app = createApp({ apiKey: secret, clientFactory: sdkMock(async () => { throw { status: 500, message: secret }; }) });
  const res = await request(app, { body: { mode: 'live', consent: true, image } });
  assert.equal(res.status, 502); assert.equal(res.text.includes(secret), false);
  await assert.rejects(() => analyzeWithGemini(image, { apiKey: secret, model: 'gemini-3.8-flash', clientFactory: sdkMock(async () => { throw Error(secret); }) }), error => error.status === 502 && !error.message.includes(secret));
});
test('blocked/truncated/malformed SDK responses are never treated as success', async () => {
  for (const providerBody of [{ candidates: [] }, { candidates: [{ finishReason: 'MAX_TOKENS' }] }, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not JSON' }] } }] }]) {
    const res = await request(createApp({ apiKey: secret, clientFactory: sdkMock(async () => providerBody) }), { body: { mode: 'live', consent: true, image } });
    assert.equal(res.status, 502);
  }
});
test('structured output strips unsolicited treatment fields and rejects unsafe content', () => {
  const value = mockAnalysis(); value.treatment = 'NEVER DISPLAY THIS';
  assert.equal(validateAnalysis(value).treatment, undefined);
  value.explanation_gu = 'spray 10 ml'; assert.throws(() => validateAnalysis(value));
  assert.throws(() => validateAnalysis({}));
});
test('unclear/non-cotton images cannot receive condition predictions', () => {
  const value = mockAnalysis(); value.image_assessment = 'not_cotton'; value.uncertainty.level = 'low';
  assert.deepEqual(validateAnalysis(value).possibilities, []);
  assert.equal(validateAnalysis(value).uncertainty.level, 'high');
});
test('advisory catalog fails closed on absent approval, unapproved hosts and future reviews', () => {
  const possibilities = [{ name_en: 'test condition' }];
  const entry = { conditionKey: 'test condition', approved: true, reviewedBy: 'TEST REVIEWER', reviewedAt: '2025-01-01',
    nameGu: 'TEST ONLY', symptomsGu: 'TEST ONLY', preventionGu: 'TEST ONLY', nextStepsGu: 'TEST ONLY',
    source: { title: 'TEST ONLY', url: 'https://example.invalid/test' } };
  const source = { approvedSourceHosts: ['example.invalid'], entries: [entry] };
  assert.equal(findAdvisories(possibilities).length, 0);
  assert.equal(findAdvisories(possibilities, source).length, 1);
  assert.equal(findAdvisories(possibilities, { ...source, approvedSourceHosts: [] }).length, 0);
  assert.equal(findAdvisories(possibilities, { ...source, entries: [{ ...entry, approved: false }] }).length, 0);
  assert.equal(findAdvisories(possibilities, { ...source, entries: [{ ...entry, reviewedAt: '2999-01-01' }] }).length, 0);
});
test('demo can be disabled, unknown API paths and methods return controlled errors', async () => {
  assert.equal((await request(createApp({ enableDemo: false }))).status, 403);
  assert.equal((await request(createApp(), { path: '/api/unknown', method: 'GET' })).status, 404);
  assert.equal((await request(createApp(), { method: 'GET' })).status, 405);
});
test('private source and dotfiles cannot be served', async () => {
  for (const path of ['/.env', '/api.env', '/server/api.env', '/%2eenv', '/server/index.js', '/docs/kapasmitra-db-review/001_schema.sql', '/%2e%2e/.env']) {
    const res = await request(createApp(), { path, method: 'GET' });
    assert.equal(res.status, 404, path);
  }
});

test('English demo uses English fields and unsupported languages fail closed', async () => {
  const app = createApp();
  const res = await request(app, { body: { mode: 'demo', language: 'en', image } });
  assert.equal(res.status, 200);
  assert.equal(res.body.language, 'en');
  assert.match(res.body.analysis.explanation, /This is a simulation/);
  assert.equal(res.body.analysis.explanation_gu, undefined);
  assert.equal(/[\u0a80-\u0aff]/u.test(JSON.stringify(res.body.analysis)), false);
  assert.equal((await request(app, { body: { mode: 'live', consent: true, language: 'fr', image } })).status, 400);
});

test('SDK client constructor pins Google endpoint, uses backend key and disables automatic retries', async () => {
  let config;
  class FakeGoogleGenAI { constructor(options) { config = options; this.models = { generateContent: async () => ({}) }; } }
  await createGeminiClient({ apiKey: secret, loadSdk: async () => ({ GoogleGenAI: FakeGoogleGenAI }) });
  assert.equal(config.apiKey, secret);
  assert.equal(config.vertexai, false);
  assert.equal(config.httpOptions.baseUrl, 'https://generativelanguage.googleapis.com');
  assert.equal(config.httpOptions.retryOptions.attempts, 1);
  assert.equal(config.httpOptions.timeout, 45_000);
});
test('upstream rate limit and invalid credentials return safe errors with retry hints', async () => {
  for (const [providerStatus, expectedStatus] of [[429,429],[401,503],[403,503],[404,503],[500,502]]) {
    const res = await request(createApp({ apiKey: secret, clientFactory: sdkFailure(providerStatus) }), { body: { mode: 'live', consent: true, image } });
    assert.equal(res.status, expectedStatus);
    assert.equal(res.text.includes(secret), false);
    assert.equal(res.text.includes('TEST PRIVATE PROVIDER ERROR'), false);
    if (providerStatus === 429) { assert.equal(res.headers['retry-after'], undefined); assert.equal(res.body.error.automaticRetry, false); }
  }
});
test('missing SDK produces a controlled error instead of exposing module paths', async () => {
  await assert.rejects(() => createGeminiClient({ apiKey: secret, loadSdk: async () => { throw Error(secret); } }),
    error => error.code === 'SDK_UNAVAILABLE' && !error.message.includes(secret));
});
test('environment loader reads api.env without overriding nonempty process values or logging keys', () => {
  const cwd = mkdtempSync(join(tmpdir(),'kapasmitra-env-'));
  try {
    writeFileSync(join(cwd,'api.env'), 'GEMINI_API_KEY="TEST_API_FILE"\nGEMINI_MODEL=gemini-3.8-flash\n');
    writeFileSync(join(cwd,'.env'), 'GEMINI_API_KEY=TEST_DEFAULT_FILE\nPORT=3001\n');
    const env = {};
    const result = loadBackendEnvironment({ cwd, env });
    assert.equal(env.GEMINI_API_KEY, 'TEST_API_FILE'); assert.equal(env.PORT, '3001');
    assert.equal(result.keyConfigured, true); assert.equal(JSON.stringify(result).includes('TEST_API_FILE'), false);
    const exported = { GEMINI_API_KEY: 'TEST_PROCESS_VALUE' }; loadBackendEnvironment({ cwd, env: exported });
    assert.equal(exported.GEMINI_API_KEY, 'TEST_PROCESS_VALUE');
    const empty = { GEMINI_API_KEY: '' }; loadBackendEnvironment({ cwd, env: empty });
    assert.equal(empty.GEMINI_API_KEY, 'TEST_API_FILE');
  } finally { rmSync(cwd,{recursive:true,force:true}); }
});
test('confidence percentages are rejected and the sample JPEG completes the simulated SDK flow', async () => {
  const unsafe = mockAnalysis(); unsafe.explanation_gu = 'Confidence: 99%';
  assert.throws(() => validateAnalysis(unsafe));
  const bytes = readFileSync(new URL('./fixtures/cotton-illustration.jpg',import.meta.url));
  const sample = validateImage({ mimeType: 'image/jpeg', base64: bytes.toString('base64') });
  assert.equal(sample.width,720); assert.equal(sample.height,500);
  const res = await request(createApp({ apiKey: secret, clientFactory: sdkMock(mockGoogle(mockAnalysis())) }), { body: { mode:'live',consent:true, image: sample } });
  assert.equal(res.status,200); assert.match(res.body.analysis.explanation_gu, /સિમ્યુલેશન/);
});

test('failure diagnostics distinguish upstream errors and truncated output without leaking provider text', async () => {
  const logs = [];
  const original = console.warn;
  console.warn = line => logs.push(JSON.parse(line));
  try {
    for (const status of [400, 429, 500]) {
      const res = await request(createApp({ apiKey: secret, clientFactory: sdkFailure(status) }), { body: { mode: 'live', consent: true, image } });
      assert.equal(res.status, status === 400 ? 503 : status === 429 ? 429 : 502);
      assert.equal(logs.at(-1).upstreamStatus, status);
      assert.equal(logs.at(-1).requestId, res.body.error.requestId);
      assert.equal(res.body.error.upstreamStatus, undefined);
    }
    await request(createApp({ apiKey: secret, clientFactory: sdkMock(async () => ({ candidates: [{ finishReason: 'MAX_TOKENS' }] })) }), { body: { mode: 'live', consent: true, image } });
    assert.equal(logs.at(-1).finishReason, 'MAX_TOKENS');
    assert.equal(JSON.stringify(logs).includes(secret), false);
    assert.equal(JSON.stringify(logs).includes('TEST PRIVATE PROVIDER ERROR'), false);
  } finally { console.warn = original; }
});

test('DNS/connectivity failures are not mislabeled as timeouts; quota remains distinct', async () => {
  for (const [failure, status, code, networkCode] of [
    [new TypeError(secret, { cause: Object.assign(new Error(secret), { code: 'EAI_AGAIN' }) }), 503, 'AI_NETWORK_ERROR', 'EAI_AGAIN'],
    [new AggregateError([Object.assign(new Error(secret), { code: 'ECONNREFUSED' })]), 503, 'AI_NETWORK_ERROR', 'ECONNREFUSED'],
    [new TypeError(secret, { cause: Object.assign(new Error(secret), { code: 'UND_ERR_CONNECT_TIMEOUT' }) }), 504, 'AI_UNAVAILABLE', 'UND_ERR_CONNECT_TIMEOUT'],
    [new DOMException(secret, 'TimeoutError'), 504, 'AI_UNAVAILABLE', null],
    [{ status: 429, message: secret }, 429, 'AI_RATE_LIMIT', null],
  ]) {
    await assert.rejects(() => analyzeWithGemini(image, {
      apiKey: secret, model: 'gemini-3.8-flash', clientFactory: sdkMock(async () => { throw failure; }),
    }), error => {
      assert.equal(error.status, status); assert.equal(error.code, code);
      assert.equal(error.diagnostics.networkCode, networkCode);
      assert.ok(error.diagnostics.geminiMs >= 0);
      assert.equal(JSON.stringify(error.diagnostics).includes(secret), false);
      return true;
    });
  }
});

test('Google structured failures produce allowlisted diagnostics rather than raw provider messages', async () => {
  for (const [status, providerStatus, reason, category] of [
    [400, 'INVALID_ARGUMENT', 'API_KEY_INVALID', 'authentication_or_permission'],
    [403, 'PERMISSION_DENIED', 'API_KEY_SERVICE_BLOCKED', 'authentication_or_permission'],
    [404, 'NOT_FOUND', undefined, 'model_or_endpoint_not_found'],
    [429, 'RESOURCE_EXHAUSTED', 'QUOTA_EXCEEDED', 'quota_or_rate_limit'],
    [503, 'UNAVAILABLE', undefined, 'upstream_failure'],
  ]) {
    const error = Object.assign(new Error(JSON.stringify({ error: { code: status, status: providerStatus,
      message: secret, details: [{ reason, metadata: { key: secret, image: image.base64 } }] } })), { status });
    const diagnostic = inspectGeminiError(error);
    assert.equal(diagnostic.upstreamStatus, status);
    assert.equal(diagnostic.providerStatus, providerStatus);
    assert.equal(diagnostic.providerReason, reason || null);
    assert.equal(diagnostic.category, category);
    assert.equal(JSON.stringify(diagnostic).includes(secret), false);
    assert.equal(JSON.stringify(diagnostic).includes(image.base64), false);
  }
  const tls = inspectGeminiError(new Error(secret, { cause: { code: 'CERT_HAS_EXPIRED' } }));
  assert.equal(tls.category, 'tls');
  const malicious = inspectGeminiError(new Error(JSON.stringify({ error: { code: 500, status: secret, details: [{ reason: secret }] } })));
  assert.equal(malicious.providerStatus, null); assert.equal(malicious.providerReason, null);
  assert.equal(JSON.stringify(malicious).includes(secret), false);
});

test('provider retry guidance preserves the longer wait and identifies daily quota', () => {
  const make = (quotaId, retryDelay, retryAfter) => ({ retryAfter, message: JSON.stringify({ error: { details: [
    { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId, description: secret }] },
    { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay },
  ] } }) });
  assert.deepEqual(quotaGuidance(make('RequestsPerMinutePerProject', '12.2s', '30')), {quotaKind:'temporary',retryAfterSeconds:30});
  assert.deepEqual(quotaGuidance(make('RequestsPerDayPerProject', '12s', undefined)), {quotaKind:'daily',retryAfterSeconds:12});
  assert.deepEqual(quotaGuidance(make('', 'invalid', secret)), {quotaKind:'unknown',retryAfterSeconds:null});
  const now = Date.UTC(2026,9,30,12);
  assert.equal(quotaGuidance(make('', '1s', new Date(now+45000).toUTCString()), now).retryAfterSeconds,45);
});

test('daily quota returns clear frontend metadata without repeating inference', async () => {
  let calls = 0;
  const failure = Object.assign(new Error(JSON.stringify({error:{status:'RESOURCE_EXHAUSTED',details:[
    {'@type':'type.googleapis.com/google.rpc.QuotaFailure',violations:[{quotaId:'GenerateRequestsPerDayPerProject',description:secret}]},
  ]}})), {status:429});
  const res = await request(createApp({apiKey:secret,model:'gemini-3.5-flash-lite',clientFactory:sdkMock(async input=>{
    calls++; assert.equal(input.model,'gemini-3.5-flash-lite');
    assert.equal(input.config.responseMimeType,'application/json');
    throw failure;
  })}), {body:{mode:'live',consent:true,language:'en',image}});
  assert.equal(calls,1); assert.equal(res.status,429);
  assert.equal(res.body.error.quotaKind,'daily'); assert.equal(res.body.error.automaticRetry,false);
  assert.match(res.body.error.message,/daily quota is exhausted/);
  assert.equal(res.headers['retry-after'],undefined); assert.equal(res.text.includes(secret),false);
});

test('SDK preserves Retry-After header on a 429 and makes only one attempt', async () => {
  let calls = 0;
  const client = await createGeminiClient({apiKey:secret,fetchImpl:async()=>{
    calls++;
    return new Response(JSON.stringify({error:{code:429,status:'RESOURCE_EXHAUSTED',message:'test limit'}}),
      {status:429,headers:{'content-type':'application/json','retry-after':'35'}});
  }});
  await assert.rejects(()=>client.models.generateContent({model:'gemini-3.5-flash-lite',contents:'test'}), error=>error.status===429 && error.retryAfter==='35');
  assert.equal(calls,1);
});

test('provider retry wait reaches the frontend unchanged', async () => {
  const failure = Object.assign(new Error(JSON.stringify({error:{details:[
    {'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:'42s'},
  ]}})),{status:429,retryAfter:'20'});
  const res = await request(createApp({apiKey:secret,clientFactory:sdkMock(async()=>{throw failure;})}),{body:{mode:'live',consent:true,language:'en',image}});
  assert.equal(res.status,429); assert.equal(res.headers['retry-after'],'42');
  assert.equal(res.body.error.retryAfterSeconds,42); assert.match(res.body.error.message,/42 seconds/);
});
