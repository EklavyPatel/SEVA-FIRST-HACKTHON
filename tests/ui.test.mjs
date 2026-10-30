import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createApp } from '../server/app.js';
import { demoAnalysis } from '../server/demo.js';
import { callHandler } from './http.js';
import { sdkMock, sdkResponse, sdkFailure } from './sdk-mock.js';

await build({ logLevel: 'error', build: { ssr: 'src/App.jsx', outDir: 'artifacts/ssr', emptyOutDir: true } });
const { default: App } = await import('../artifacts/ssr/App.js');
const jpeg = Buffer.from([0xff,0xd8,0xff,0xc0,0,17,8,0,64,0,64,3,1,0x11,0,2,0x11,0,3,0x11,0,0xff,0xd9]);
const dataUrl = 'data:image/jpeg;base64,' + jpeg.toString('base64');
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

// DOM state tests, NOT a real browser: canvas/image decoding is deliberately stubbed.
async function mount(app, { storedLanguage } = {}) {
  const dom = new JSDOM('<!doctype html><html lang="gu"><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1:5173/', pretendToBeVisual: true });
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
  globalThis.fetch = async (path, options = {}) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const response = await callHandler(app, { path, method: options.method || 'GET', body: options.body });
    return new Response(response.text, { status: response.status, headers: response.headers });
  };
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
    assert.match(document.querySelector('nav').textContent, /How it works/);
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
