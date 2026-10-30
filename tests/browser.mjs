import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';
if (!['127.0.0.1','localhost'].includes(new URL(baseURL).hostname)) throw Error('Browser QA is local-only.');
await mkdir('artifacts', { recursive: true });
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('html').getAttribute('lang'), 'gu');
  await page.screenshot({ path: 'artifacts/home-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'નમૂના સાથે જુઓ' }).click();
  await page.getByTestId('image-preview').waitFor();
  assert.match(await page.locator('.analysis-mode').textContent(), /ડેમો મોડ/);
  await page.getByRole('button', { name: 'ડેમો પરિણામ જુઓ', exact: true }).click();
  await page.getByTestId('results').waitFor();
  assert.match(await page.getByTestId('results').textContent(), /તમારા ફોટાનું AI વિશ્લેષણ થયું નથી/);
  assert.match(await page.getByTestId('results').textContent(), /કોઈ ઉપચાર કે માત્રા બતાવવામાં આવતી નથી/);
  await page.screenshot({ path: 'artifacts/demo-results-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'નવો ફોટો લો', exact: true }).click();
  assert.equal(await page.getByTestId('results').count(), 0);
  assert.equal(await page.getByTestId('image-preview').count(), 0);
  // A browser-generated JPEG exercises real decoding and canvas preparation.
  const jpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const context = canvas.getContext('2d'); context.fillStyle = '#eef1df'; context.fillRect(0,0,640,480);
    context.fillStyle = '#497347'; context.beginPath(); context.ellipse(320,240,160,95,-.6,0,Math.PI*2); context.fill();
    return canvas.toDataURL('image/jpeg').split(',')[1];
  });
  await page.locator('#crop-photo').setInputFiles({ name: 'synthetic-test-leaf.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg,'base64') });
  await page.getByTestId('image-preview').waitFor();
  assert.equal(await page.getByRole('button', { name: 'ડેમો પરિણામ જુઓ', exact: true }).isEnabled(), true);
  await page.locator('#crop-photo').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') });
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').textContent(), /JPG, PNG અથવા WebP/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'No mobile horizontal overflow');
  await page.screenshot({ path: 'artifacts/home-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: real browser desktop/mobile, sample preview, explicit demo, retake, actual JPEG decoding, invalid upload. Screenshots: artifacts/');
} finally { await browser.close(); }
