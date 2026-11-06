// Inspect provider metadata in memory; return only numeric timing and fixed categories.
export function quotaGuidance(error, now = Date.now()) {
  let provider;
  try { const body = JSON.parse(error.message); provider = body?.error || body; } catch { /* No raw text output. */ }
  const details = Array.isArray(provider?.details) ? provider.details.slice(0, 30) : [];
  const violations = details.flatMap(item => Array.isArray(item?.violations) ? item.violations.slice(0, 30) : []);
  const daily = violations.some(item => /per[_ -]?day|daily/i.test(`${item?.quotaId || ''} ${item?.quotaMetric || ''}`));
  const temporary = !daily && violations.some(item => /per[_ -]?minute|per[_ -]?second/i.test(`${item?.quotaId || ''} ${item?.quotaMetric || ''}`));
  const delays = details.filter(item => item?.['@type'] === 'type.googleapis.com/google.rpc.RetryInfo').map(item => {
    const match = typeof item.retryDelay === 'string' && /^(\d+(?:\.\d+)?)s$/.exec(item.retryDelay);
    return match ? Math.ceil(Number(match[1])) : null;
  });
  const header = error.retryAfter;
  if (typeof header === 'string') {
    if (/^\d+$/.test(header.trim())) delays.push(Number(header.trim()));
    else { const date = Date.parse(header); if (Number.isFinite(date)) delays.push(Math.max(0, Math.ceil((date - now) / 1000))); }
  }
  const valid = delays.filter(value => Number.isSafeInteger(value) && value >= 0 && value <= 31_536_000);
  return { quotaKind: daily ? 'daily' : temporary ? 'temporary' : 'unknown', retryAfterSeconds: valid.length ? Math.max(...valid) : null };
}
