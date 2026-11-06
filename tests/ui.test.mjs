import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import {createAuthenticatedApp as createApp} from './helpers/authenticated-app.mjs';
import { demoAnalysis } from '../server/demo.js';
import { callHandler } from './http.js';
import { sdkMock, sdkResponse, sdkFailure } from './sdk-mock.js';
import { readFile } from 'node:fs/promises';
import { openResearchStore } from '../server/research-store.js';

const originalNodeEnv = process.env.NODE_ENV;
await build({ logLevel: 'error', build: { ssr: 'src/App.jsx', outDir: 'artifacts/ssr', emptyOutDir: true } });
if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = originalNodeEnv;
const { default: App } = await import('../artifacts/ssr/App.js');
const jpeg = await readFile(new URL('./fixtures/cotton-illustration.jpg', import.meta.url));
const dataUrl = 'data:image/jpeg;base64,' + jpeg.toString('base64');
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function waitForUi(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate() && Date.now() < deadline) await act(async () => delay(20));
  assert.ok(predicate(), 'Expected UI state did not appear');
}

// DOM state tests, NOT a real browser: canvas/image decoding is deliberately stubbed.
async function mount(app, { storedLanguage, accountFailure, initialRoute='crop', loginAs='a', signedOut=false } = {}) {
  const dom = new JSDOM('<!doctype html><html lang="gu"><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1:5173/#/'+initialRoute, pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  if (storedLanguage) dom.window.localStorage.setItem('kapasmitra-language', storedLanguage);
  globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  globalThis.Image = class { naturalWidth = 640; naturalHeight = 480; async decode() {} };
  const oldCreate = URL.createObjectURL; const oldRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => 'blob:test-only'; URL.revokeObjectURL = () => {};
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {} });
  dom.window.HTMLCanvasElement.prototype.toDataURL = () => dataUrl;
  const originalFetch = globalThis.fetch;
  const authCookie=signedOut?null:await app.login(loginAs);
  const cookies = new Map(authCookie?[authCookie.split('=')]:[]); // Browser-cookie behavior for this DOM-only test harness.
  globalThis.fetch = async (path, options = {}) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (path === '/api/account/me' && accountFailure?.active) return new Response(JSON.stringify({configured:true,error:{code:'ACCOUNT_NETWORK',message:'The backend could not reach Supabase.'}}),{status:503,headers:{'Content-Type':'application/json'}});
    const response = await callHandler(app, { path, method: options.method || 'GET', body: options.body, headers: { cookie: [...cookies].map(([name,value]) => name + '=' + value).join('; ') } });
    const cookie = response.headers['set-cookie'];
    if (cookie) { const [name,...value] = cookie.split(';')[0].split('='); cookies.set(name,value.join('=')); }
    return new Response(response.text, { status: response.status, headers: response.headers });
  };
  // Initialize React's DOM event support only after the test document exists.
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  await act(async () => { root.render(React.createElement(App)); await delay(20); });
  async function click(text) {
    const button = [...document.querySelectorAll('button')].find(element => element.textContent.includes(text));
    assert.ok(button, `Button not found: ${text}`);
    await act(async () => button.click());
    return button;
  }
  async function upload(type = 'image/jpeg') {
    const input = document.querySelector('#crop-photo');
    Object.defineProperty(input, 'files', { configurable: true, value: [new File([jpeg], 'test-photo.jpg', { type })] });
    await act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await delay(20); });
  }
  return { click, upload, async cleanup() {
    await act(async () => root.unmount()); dom.window.close();
    globalThis.fetch = originalFetch; URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke;
  } };
}

test('Gujarati homepage → upload → preview → explicit demo → result → retake', async () => {
  const ui = await mount(createApp());
  try {
    assert.match(document.querySelector('h1').textContent, /કપાસની ચિંતા/);
    assert.equal(document.querySelector('button[type="submit"]').disabled, true);
    await ui.upload();
    assert.ok(document.querySelector('[data-testid="image-preview"] img'));
    assert.match(document.body.textContent, /ડેમો મોડ · સિમ્યુલેશન/);
    await ui.click('ડેમો પરિણામ જુઓ');
    assert.match(document.body.textContent, /ડેમો તૈયાર થાય છે/);
    await act(async () => delay(750));
    assert.ok(document.querySelector('[data-testid="results"]'));
    assert.match(document.body.textContent, /તમારા ફોટાનું AI વિશ્લેષણ થયું નથી/);
    assert.match(document.body.textContent, /અનિશ્ચિતતા: વધુ/);
    assert.match(document.body.textContent, /કોઈ ઉપચાર કે માત્રા બતાવવામાં આવતી નથી/);
    await ui.click('નવો ફોટો લો');
    assert.equal(document.querySelector('[data-testid="image-preview"]'), null);
    assert.equal(document.querySelector('[data-testid="results"]'), null);
  } finally { await ui.cleanup(); }
});

test('unsupported upload displays an error and does not permit analysis', async () => {
  const ui = await mount(createApp());
  try {
    await ui.upload('image/gif');
    assert.match(document.querySelector('[role="alert"]').textContent, /JPG, PNG અથવા WebP/);
    assert.equal(document.querySelector('button[type="submit"]').disabled, true);
  } finally { await ui.cleanup(); }
});

test('live flow requires consent and displays a clearly provisional result', async () => {
  let providerCalls = 0;
  const ui = await mount(createApp({ apiKey: 'TEST ONLY', clientFactory: sdkMock(async () => {
    providerCalls++;
    return sdkResponse(demoAnalysis);
  }) }));
  try {
    await ui.upload();
    assert.equal(document.querySelector('button[type="submit"]').disabled, true);
    const consent = document.querySelector('input[type="checkbox"]'); assert.ok(consent);
    await act(async () => consent.click());
    assert.equal(document.querySelector('button[type="submit"]').disabled, false);
    await ui.click('ફોટાનું વિશ્લેષણ કરો');
    await act(async () => delay(30));
    assert.equal(providerCalls, 1);
    assert.ok(document.querySelector('[data-testid="results"]'));
    assert.match(document.body.textContent, /આ પુષ્ટિ થયેલું નિદાન નથી/);
    assert.match(document.body.textContent, /gemini-3.8-flash/);
  } finally { await ui.cleanup(); }
});

test('provider failure is visible, retains preview and allows retry', async () => {
  const ui = await mount(createApp({ apiKey: 'TEST ONLY', clientFactory: sdkFailure(500) }));
  try {
    await ui.upload(); await act(async () => document.querySelector('input[type="checkbox"]').click());
    await ui.click('ફોટાનું વિશ્લેષણ કરો'); await act(async () => delay(30));
    assert.match(document.querySelector('[role="alert"]').textContent, /વિશ્લેષણ પૂરું થઈ શક્યું નથી/);
    assert.ok(document.querySelector('[data-testid="image-preview"]'));
    assert.equal(document.querySelector('button[type="submit"]').disabled, false);
    assert.equal(document.querySelector('[data-testid="results"]'), null);
  } finally { await ui.cleanup(); }
});

test('retake during analysis prevents stale demo results from reappearing', async () => {
  const ui = await mount(createApp());
  try {
    await ui.upload(); await ui.click('ડેમો પરિણામ જુઓ');
    await act(async () => document.querySelector('button[aria-label="ફોટો દૂર કરો"]').click());
    await act(async () => delay(750));
    assert.equal(document.querySelector('[data-testid="results"]'), null);
    assert.equal(document.querySelector('[data-testid="image-preview"]'), null);
  } finally { await ui.cleanup(); }
});

async function changeLanguage(language) {
  const select = document.querySelector('select[aria-label="Language / ભાષા"]');
  assert.ok(select);
  await act(async () => {
    select.value = language;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

test('language selector translates homepage, errors and demo results, and switches back', async () => {
  const ui = await mount(createApp());
  try {
    assert.equal(document.documentElement.lang, 'gu');
    await changeLanguage('en');
    assert.equal(document.documentElement.lang, 'en');
    assert.equal(window.localStorage.getItem('kapasmitra-language'), 'en');
    assert.match(document.title, /KapasMitra AI/);
    assert.match(document.querySelector('h1').textContent, /Worried about your cotton/);
    assert.match(document.querySelector('nav').textContent, /Agricultural guidance/);
    await ui.upload('image/gif');
    assert.match(document.querySelector('[role="alert"]').textContent, /Choose a JPG, PNG, or WebP photo/);
    await ui.upload();
    await ui.click('View demo results');
    await act(async () => delay(750));
    const result = document.querySelector('[data-testid="results"]');
    assert.match(result.textContent, /Simulation — AI has not analyzed your photo/);
    assert.match(result.textContent, /This is a simulation/);
    assert.equal(/[\u0a80-\u0aff]/u.test(result.textContent), false);
    await changeLanguage('gu');
    assert.equal(document.documentElement.lang, 'gu');
    assert.match(document.querySelector('h1').textContent, /કપાસની ચિંતા/);
    assert.match(result.textContent, /આ સિમ્યુલેશન છે/);
  } finally { await ui.cleanup(); }
});

test('saved English preference restores without discarding the upload on language change', async () => {
  const ui = await mount(createApp(), { storedLanguage: 'en' });
  try {
    assert.equal(document.documentElement.lang, 'en');
    assert.equal(document.querySelector('select').value, 'en');
    await ui.upload();
    const appearance = document.querySelector('button[aria-label="Switch to dark theme"]');
    assert.ok(appearance);
    await act(async () => appearance.click());
    assert.equal(document.documentElement.dataset.theme, 'dark');
    assert.ok(document.querySelector('[data-testid="image-preview"]'));
    assert.ok(document.querySelector('button[aria-label="Switch to light theme"]'));
    await act(async () => appearance.click());
    assert.equal(document.documentElement.dataset.theme, 'light');
    assert.deepEqual(Object.keys(window.localStorage).sort(), ['kapasmitra-language', 'kapasmitra-reduced-motion', 'kapasmitra-theme']);
    await changeLanguage('gu');
    assert.ok(document.querySelector('[data-testid="image-preview"]'));
    assert.equal(window.localStorage.getItem('kapasmitra-language'), 'gu');
  } finally { await ui.cleanup(); }
});

test('English live flow passes selected language through to Gemini and displays English output', async () => {
  const output = {
    image_assessment: 'unclear', possibilities: [], visible_symptoms: [],
    explanation: 'Visible features are unclear in this test fixture.',
    uncertainty: { level: 'high', reason: 'Expert review is needed.' },
  };
  let prompt;
  const ui = await mount(createApp({ apiKey: 'TEST ONLY', clientFactory: sdkMock(async options => {
    prompt = options;
    return sdkResponse(output);
  }) }), { storedLanguage: 'en' });
  try {
    await ui.upload();
    await act(async () => document.querySelector('input[type="checkbox"]').click());
    await ui.click('Analyze photo');
    await act(async () => delay(30));
    assert.match(prompt.config.systemInstruction, /plain English/);
    assert.ok(prompt.config.responseSchema.properties.explanation);
    assert.equal(prompt.config.responseSchema.properties.explanation_gu, undefined);
    assert.match(document.querySelector('.explanation-text').textContent, /Visible features are unclear/);
    await changeLanguage('gu');
    assert.match(document.querySelector('.language-result-note').textContent, /આ પરિણામ અગાઉની ભાષામાં છે/);
    assert.equal(document.querySelector('.explanation-text').getAttribute('lang'), 'en');
  } finally { await ui.cleanup(); }
});

test('workspace navigation and localized result export preserve demo limitations', async () => {
  const ui = await mount(createApp(), { storedLanguage: 'en' });
  const originalCreate = URL.createObjectURL;
  const originalClick = window.HTMLAnchorElement.prototype.click;
  let downloadedBlob; let filename; let prints = 0;
  URL.createObjectURL = blob => { downloadedBlob = blob; return 'blob:review-export'; };
  window.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
  window.print = () => { prints++; };
  try {
    assert.ok(document.querySelector('.workspace-sidebar'));
    assert.match(document.querySelector('.review-placeholder').textContent, /A closer look/);
    for (const link of document.querySelectorAll('.workspace-sidebar nav a')) {
      assert.match(link.getAttribute('href'), /^#\//, 'Navigation uses a separate route');
    }
    await ui.upload(); await ui.click('View demo results');
    await act(async () => delay(750));
    assert.ok(document.querySelector('.workspace-results [data-testid="results"]'));
    assert.ok(document.querySelector('.review-photo img'));
    assert.equal(document.querySelector('.certainty-ring').textContent, '—');
    await ui.click('Save text');
    assert.equal(filename, 'kapasmitra-crop-review.txt');
    const text = await downloadedBlob.text();
    assert.match(text, /Simulation — AI has not analyzed your photo/);
    assert.match(text, /Uncertainty:/);
    assert.match(text, /agricultural expert/);
    assert.equal(/[\u0a80-\u0aff]/u.test(text), false);
    await ui.click('Print / Save PDF');
    assert.equal(prints, 1);
  } finally {
    URL.createObjectURL = originalCreate;
    window.HTMLAnchorElement.prototype.click = originalClick;
    await ui.cleanup();
  }
});


test('Settings saves appearance and motion preferences and resets display controls', async () => {
  const ui = await mount(createApp(), {storedLanguage: 'en'});
  try {
    await ui.click('Settings');
    assert.equal(document.querySelector('.cotton-workspace').dataset.page, 'settings');
    const selects = document.querySelectorAll('.settings-page select');
    await act(async () => { selects[1].value = 'dark'; selects[1].dispatchEvent(new window.Event('change', {bubbles:true})); });
    assert.equal(document.documentElement.dataset.theme, 'dark');
    await act(async () => document.querySelector('.settings-page input[type="checkbox"]').click());
    assert.equal(document.documentElement.dataset.reducedMotion, 'true');
    assert.equal(window.localStorage.getItem('kapasmitra-theme'), 'dark');
    assert.equal(window.localStorage.getItem('kapasmitra-reduced-motion'), 'true');
    await ui.click('Reset display settings');
    assert.equal(document.documentElement.dataset.theme, 'light');
    assert.equal(document.documentElement.lang, 'gu');
    assert.equal(document.documentElement.dataset.reducedMotion, 'false');
    await ui.click('પૂર્ણ થયું');
    assert.equal(document.querySelector('.cotton-workspace').dataset.page, 'crop');
  } finally { await ui.cleanup(); }
});

test('separate page routes preserve the crop upload and expose a standalone Settings page',async()=>{
 const ui=await mount(createApp(),{storedLanguage:'en'});try{
 await ui.upload();
 await act(async()=>{document.querySelector('a[href="#/community"]').click();await delay(20);});
 assert.equal(document.querySelector('.cotton-workspace').dataset.page,'community');
 assert.equal(document.querySelectorAll('.route-page:not([hidden])').length,1);
 await act(async()=>{window.location.hash='/crop';window.dispatchEvent(new window.HashChangeEvent('hashchange'));await delay(30);});
 assert.ok(document.querySelector('[data-testid="image-preview"]'));
 await ui.click('Settings');assert.equal(document.querySelector('.cotton-workspace').dataset.page,'settings');assert.equal(document.querySelector('.settings-page').closest('.route-page').hidden,false);
 }finally{await ui.cleanup();}
});

test('skip link focuses the current page and photo shortcut keeps the crop route', async () => {
 const ui = await mount(createApp(), { storedLanguage: 'en' });
 try {
  await act(async () => { document.querySelector('a[href="#/about"]').click(); await delay(20); });
  const aboutHash = window.location.hash;
  await act(async () => document.querySelector('.skip-link').click());
  assert.equal(document.activeElement, document.querySelector('main'));
  assert.equal(window.location.hash, aboutHash);
  assert.equal(document.querySelector('.cotton-workspace').dataset.page, 'about');
  await act(async () => { document.querySelector('a[href="#/crop"]').click(); await delay(20); });
  const cropHash = window.location.hash;
  await act(async () => document.querySelector('.scan-link').click());
  assert.equal(window.location.hash, cropHash);
  assert.equal(document.activeElement, document.querySelector('#crop-photo'));
 } finally { await ui.cleanup(); }
});

test('Gujarati live result and follow-up use Gujarati guidance and reset consent after each answer', async () => {
 const calls = [];
 const analysis = { image_assessment:'unclear', possibilities:[], visible_symptoms_gu:[], explanation_gu:'આ ફોટામાંથી કારણ ચોક્કસ કહી શકાય તેમ નથી.', uncertainty:{level:'high',reason_gu:'વધુ સ્પષ્ટ ફોટો અને નિષ્ણાતની સમીક્ષા જરૂરી છે.'} };
 const ui = await mount(createApp({apiKey:'TEST ONLY',clientFactory:sdkMock(async options=>{
  calls.push(options);
  return options.config.responseMimeType ? sdkResponse(analysis) : {text:'દિવસના પ્રકાશમાં પાનની નીચેની બાજુ જુઓ. લક્ષણો ક્યારથી છે?',candidates:[{finishReason:'STOP'}]};
 })}));
 try {
  await ui.upload();
  await act(async()=>document.querySelector('.upload-card .consent input').click());
  await ui.click('ફોટાનું વિશ્લેષણ કરો');
  await waitForUi(()=>document.querySelector('.explanation-text'));
  assert.equal(document.querySelector('.explanation-text').textContent,analysis.explanation_gu);
  assert.equal(document.querySelector('.explanation-text').lang,'gu');
  const input=document.querySelector('.followup-panel textarea');
  const setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;
  await act(async()=>{setter.call(input,'વધુ સ્પષ્ટ ફોટો કેવી રીતે લઉં?');input.dispatchEvent(new window.Event('input',{bubbles:true}));input.dispatchEvent(new window.Event('change',{bubbles:true}));});
  await act(async()=>document.querySelector('.followup-panel input[type="checkbox"]').click());
  await act(async()=>document.querySelector('.followup-panel button[type="submit"]').click());
  await waitForUi(()=>document.querySelector('.chat-turn.model'));
  assert.match(document.querySelector('.chat-turn.model').textContent,/પાનની નીચેની બાજુ/);
  assert.equal(document.querySelector('.followup-panel input[type="checkbox"]').checked,false);
  assert.match(calls[0].config.systemInstruction,/Gujarati script/);
  assert.match(calls[1].config.systemInstruction,/Gujarati script/);
 } finally {await ui.cleanup();}
});

test('account endpoint failures show a retryable network error instead of a false unconfigured message', async () => {
 const accountFailure={active:true};
 const ui=await mount(createApp(),{storedLanguage:'en',accountFailure});
 try {
  await act(async()=>{document.querySelector('a[href="#/login"]').click();await delay(20);});
  assert.match(document.querySelector('.account-page [role="alert"]').textContent,/could not reach Supabase/);
  assert.ok(!document.querySelector('.account-page').textContent.includes('not configured'));
  accountFailure.active=false;
  await ui.click('Retry connection');
  await waitForUi(()=>!document.querySelector('.account-page [role="alert"]'));
  assert.match(document.querySelector('.account-page').textContent,/Normal user/);
 }finally{await ui.cleanup();}
});

test('Supabase photo UI keeps guidance after failed save, retries once, lists and withdraws saved contribution',async()=>{
 const {createSupabasePhotoStore}=await import('../server/supabase-photos.js');
 const {photoProvider}=await import('./helpers/supabase-photos.mjs');
 const provider=photoProvider(),jobs=new Map();
 const photoStore=createSupabasePhotoStore({url:'https://fixture.supabase.co',publicKey:'sb_publishable_fixture',serviceKey:'sb_secret_fixture_photos',fetchImpl:provider.fetchImpl,outbox:{add(id,objectPath){jobs.set(id,{id,objectPath,createdAt:0});},remove(id){jobs.delete(id);},entries(){return [...jobs.values()];}}});
 const localStore=openResearchStore({path:':memory:'});
 const ui=await mount(createApp({researchStore:localStore,photoStore,accountFetchImpl:provider.fetchImpl,apiKey:'fixture',clientFactory:sdkMock(async()=>sdkResponse({image_assessment:'unclear',possibilities:[],visible_symptoms:[],explanation:'Visible features are unclear in this test photo.',uncertainty:{level:'high',reason:'Expert review is needed.'}}))}),{storedLanguage:'en'});
 try{
  await ui.upload();
  await act(async()=>document.querySelector('.consent input').click());
  await ui.click('Analyze photo');
  await waitForUi(()=>document.querySelector('[data-testid="results"]'));
  const guidance=document.querySelector('[data-testid="results"]').textContent;
  const contribution=document.querySelector('.research-contribution');contribution.open=true;
  const checks=contribution.querySelectorAll('form > fieldset > label.research-checkbox input');
  assert.equal(checks[0].checked,false);assert.equal(checks[1].checked,false);
  await act(async()=>{checks[0].click();checks[1].click();});
  provider.state.failDatabase=true;
  await ui.click('Save photo for research');
  await waitForUi(()=>contribution.querySelector('[role="alert"]'));
  assert.match(contribution.textContent,/guidance remains available/);
  assert.equal(document.querySelector('[data-testid="results"]').textContent,guidance);
  assert.equal(provider.objects.size,0);
  provider.state.failDatabase=false;
  await ui.click('Save photo for research');
  await waitForUi(()=>contribution.textContent.includes('Photo saved to the database'));
  assert.equal(provider.rows.length,1);assert.equal(provider.rows[0].ai_status,'completed');
  await act(async()=>{document.querySelector('.workspace-sidebar a[href="#/my-submissions"]').click();await delay(20);});
  await waitForUi(()=>document.querySelector('.research-photo-card'));
  await act(async()=>document.querySelector('.research-photo-card').click());
  await waitForUi(()=>document.querySelector('.photo-review-layout'));
  assert.match(document.querySelector('.photo-review-layout').textContent,/Original AI suggestions/);
  await ui.click('Keep photo, withdraw research sharing');
  await waitForUi(()=>provider.rows[0].research_consent===false);
  assert.equal(provider.objects.size,1);
 }finally{await ui.cleanup();localStore.close();}
});

test('research unavailable message gives accurate setup guidance and retry recovers capabilities',async()=>{
 const {createSupabasePhotoStore}=await import('../server/supabase-photos.js');
 const {photoProvider}=await import('./helpers/supabase-photos.mjs');
 const provider=photoProvider();const localStore=openResearchStore({path:':memory:'});
 const photoStore=createSupabasePhotoStore({url:'https://fixture.supabase.co',publicKey:'sb_publishable_fixture',serviceKey:'sb_secret_fixture_photos',fetchImpl:provider.fetchImpl,outbox:{add(){},remove(){},entries(){return [];}}});
 const handler=createApp({researchStore:localStore,photoStore,accountFetchImpl:provider.fetchImpl});let disconnected=true;
 const app=async(req,res)=>{
  if(req.url==='/api/health'&&disconnected){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({liveAvailable:false,demoAvailable:true,researchAvailable:false}));}
  return handler(req,res);
 };
 app.login=handler.login;
 const ui=await mount(app,{storedLanguage:'en'});
 try{
  await act(async()=>{document.querySelector('.workspace-sidebar a[href="#/my-submissions"]').click();await delay(20);});
  assert.match(document.querySelector('#research-panel').textContent,/not set up yet/);
  assert.ok(!document.querySelector('#research-panel').textContent.includes('Restart the backend'));
  disconnected=false;await ui.click('Retry photo connection');
  await waitForUi(()=>document.querySelector('#research-panel .research-empty'));
  assert.match(document.querySelector('#research-panel').textContent,/A growing collection starts here/);
 }finally{await ui.cleanup();localStore.close();}
});

test('landing explains open contribution versus approved dataset access; login uses one accessible form',async()=>{
 const ui=await mount(createApp(),{storedLanguage:'en',initialRoute:'home',signedOut:true});
 try{
  assert.ok(document.querySelector('.landing-hero'));
  assert.match(document.querySelector('.landing-research').textContent,/No research approval is needed to contribute/);
  assert.match(document.querySelector('.landing-research').textContent,/Admin approval unlocks only photos with active sharing consent/);
  await act(async()=>{window.location.hash='/my-submissions';window.dispatchEvent(new window.HashChangeEvent('hashchange'));await delay(30);});
  await waitForUi(()=>document.querySelector('.auth-layout'));
  assert.equal(document.querySelectorAll('.account-page form').length,1);
  const password=document.querySelector('input[autocomplete="current-password"]');assert.equal(password.type,'password');
  const toggle=document.querySelector('button[aria-label="Show password"]');await act(async()=>toggle.click());assert.equal(password.type,'text');
  assert.ok(document.querySelector('a[href="#/forgot-password"]'));
 }finally{await ui.cleanup();}
});
