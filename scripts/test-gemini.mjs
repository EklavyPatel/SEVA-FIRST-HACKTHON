import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadBackendEnvironment } from '../server/env.js';
import { validateImage, MAX_IMAGE_BYTES } from '../server/image.js';
import { createApp } from '../server/app.js';
import { callHandler } from '../tests/http.js';

// One explicitly requested live call. Never log secrets, request bodies, or provider errors.
loadBackendEnvironment();
const sample = resolve(process.argv[2] || 'tests/fixtures/cotton-illustration.jpg');
let stage = 'file';
try {
  const info = await stat(sample);
  if (!info.isFile()) throw Object.assign(new Error(), { code: 'SAMPLE_NOT_FILE' });
  if (info.size > MAX_IMAGE_BYTES) throw Object.assign(new Error(), { code: 'SAMPLE_TOO_LARGE' });
  const image = validateImage({ mimeType: 'image/jpeg', base64: (await readFile(sample)).toString('base64') });
  console.log(JSON.stringify({ imageValidated: true, input: sample === resolve('tests/fixtures/cotton-illustration.jpg') ? 'cotton illustration, not a field photograph' : 'user-selected JPEG', width: image.width, height: image.height }));
  if (!process.env.GEMINI_API_KEY?.trim()) {
    console.error('BLOCKED: GEMINI_API_KEY is empty or missing. Save it locally in api.env; do not paste it into chat.');
    process.exitCode = 1;
  } else {
    stage = 'analysis';
    const response = await callHandler(createApp({ apiKey: process.env.GEMINI_API_KEY.trim(), model: process.env.GEMINI_MODEL || 'gemini-3.8-flash' }),
      { body: { mode: 'live', language: 'gu', image } });
    if (response.status !== 200) {
      // Error codes come from our allowlisted backend, never raw SDK messages.
      console.error(JSON.stringify({ success: false, status: response.status, code: response.body.error?.code || 'UNKNOWN' }));
      process.exitCode = 1;
    } else {
      const { analysis } = response.body;
      console.log(JSON.stringify({ success: true, language: response.body.language,
        possibleCausesCount: analysis.possibilities.length, uncertainty: analysis.uncertainty.level,
        hasGujaratiExplanation: /[\u0a80-\u0aff]/u.test(analysis.explanation_gu), expertReviewRequired: true }));
    }
  }
} catch (error) {
  // Only known local failure categories are displayed; never print raw errors or paths.
  if (stage === 'file') {
    const messages = {
      ENOENT: 'Image file not found. /path/to/sample-cotton.jpg is only an example. Use an existing JPEG path, or run npm run test:gemini for the bundled illustration.',
      EACCES: 'The image file cannot be read. Check its local file permissions.',
      SAMPLE_NOT_FILE: 'The selected path is not a file. Choose an existing JPEG image.',
      SAMPLE_TOO_LARGE: 'The JPEG must be no larger than 3 MiB. Choose a smaller image.',
    };
    console.error('FAILED: ' + (messages[error?.code] || 'The file is not a supported JPEG. Choose a valid JPEG within the image-size and dimension limits.'));
  } else {
    console.error('FAILED: Could not complete the live test. No provider details were logged.');
  }
  process.exitCode = 1;
}
