import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {loadBackendEnvironment} from '../server/env.js';
loadBackendEnvironment();
const baseURL=process.env.E2E_BASE_URL||'http://127.0.0.1:5173';
if(!['127.0.0.1','localhost'].includes(new URL(baseURL).hostname))throw Error('Browser QA is local-only.');
await mkdir('artifacts',{recursive:true});
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||(existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':undefined);
const browser=await chromium.launch({executablePath,headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(baseURL,{waitUntil:'networkidle'});
 await page.locator('.landing-hero').waitFor();
 assert.equal(await page.locator('#crop-photo').count(),0);
 await page.screenshot({path:'artifacts/home-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'artifacts/home-mobile.png',fullPage:true});
 await page.locator('.landing-actions a[href="#/crop"]').click();
 await page.locator('.auth-panel form').waitFor();
 assert.equal(await page.locator('#crop-photo').count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'artifacts/login-mobile.png',fullPage:true});
 if(!process.env.TEST_AUTH_EMAIL_A||!process.env.TEST_AUTH_PASSWORD_A){
  console.log(JSON.stringify({publicPages:'passed',authenticatedFlow:'not_tested',missing:['TEST_AUTH_EMAIL_A','TEST_AUTH_PASSWORD_A'],browserErrors:errors}));
 }else{
  await page.locator('input[type=email]').fill(process.env.TEST_AUTH_EMAIL_A);
  await page.locator('input[autocomplete=current-password]').fill(process.env.TEST_AUTH_PASSWORD_A);
  await page.locator('button[type=submit]').click();
  await page.locator('#crop-photo').waitFor({state:'attached'});
  assert.match(page.url(),/#\/crop$/);
  await page.getByRole('button',{name:'નમૂના સાથે જુઓ',exact:true}).click();
  await page.getByTestId('image-preview').waitFor();
  await page.getByRole('button',{name:'ડેમો પરિણામ જુઓ',exact:true}).click();
  await page.getByTestId('results').waitFor();
  assert.match(await page.getByTestId('results').innerText(),/તમારા ફોટાનું AI વિશ્લેષણ થયું નથી/);
  await page.getByRole('button',{name:'નવો ફોટો લો',exact:true}).click();
  assert.equal(await page.getByTestId('image-preview').count(),0);
  const jpeg=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const ctx=canvas.getContext('2d');ctx.fillStyle='#eef1df';ctx.fillRect(0,0,640,480);ctx.fillStyle='#497347';ctx.beginPath();ctx.ellipse(320,240,160,95,-.6,0,Math.PI*2);ctx.fill();return canvas.toDataURL('image/jpeg').split(',')[1];});
  await page.locator('#crop-photo').setInputFiles({name:'synthetic-leaf.jpg',mimeType:'image/jpeg',buffer:Buffer.from(jpeg,'base64')});
  await page.getByTestId('image-preview').waitFor();
  await page.locator('#crop-photo').setInputFiles({name:'invalid.txt',mimeType:'text/plain',buffer:Buffer.from('invalid')});
  await page.getByRole('alert').waitFor();
  await page.goto(baseURL+'/#/account',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'બહાર નીકળો',exact:true}).click();
  await page.locator('.landing-hero').waitFor();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({publicPages:'passed',authenticatedFlow:'passed_against_configured_backend',checks:['destination after login','explicit demo','retake','real JPEG preparation','invalid upload','logout'],browserErrors:errors}));
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
