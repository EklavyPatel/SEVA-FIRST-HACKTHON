export async function loadCapabilities() {
  const response = await fetch('/api/health', { signal: AbortSignal.timeout(7000), cache: 'no-store' });
  if (!response.ok) throw new Error('સેવા સાથે જોડાણ થઈ શક્યું નથી.');
  const data = await response.json();
  if (typeof data.liveAvailable !== 'boolean' || typeof data.demoAvailable !== 'boolean') throw new Error('સેવાનો જવાબ વાંચી શકાયો નથી.');
  return data;
}

export async function analyzeImage(image, mode, signal, language = 'gu') {
  let response;
  try {
    response = await fetch('/api/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, language, image: { base64: image.base64, mimeType: image.mimeType } }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(55_000)]),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('સેવા સુધી પહોંચી શકાયું નથી. ઇન્ટરનેટ તપાસીને ફરી પ્રયાસ કરો.');
  }
  let body;
  try { body = await response.json(); } catch { throw new Error('સેવાનો જવાબ વાંચી શકાયો નથી. ફરી પ્રયાસ કરો.'); }
  if (!response.ok) throw new Error(body.error?.message || 'વિશ્લેષણ પૂરું થયું નથી. ફરી પ્રયાસ કરો.');
  if (body.mode !== mode || !body.analysis || !Array.isArray(body.advisories)) throw new Error('અણધાર્યો જવાબ મળ્યો છે. ફરી પ્રયાસ કરો.');
  return body;
}
