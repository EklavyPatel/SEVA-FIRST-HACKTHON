// Return a fixed vocabulary rather than attempting to redact arbitrary provider text.
// SDK error messages can contain URLs, credentials, prompts, and image payloads.
const statuses = new Set(['INVALID_ARGUMENT', 'UNAUTHENTICATED', 'PERMISSION_DENIED', 'NOT_FOUND', 'RESOURCE_EXHAUSTED', 'DEADLINE_EXCEEDED', 'INTERNAL', 'UNAVAILABLE', 'FAILED_PRECONDITION']);
const reasons = new Set(['API_KEY_INVALID', 'API_KEY_EXPIRED', 'API_KEY_SERVICE_BLOCKED', 'API_KEY_HTTP_REFERRER_BLOCKED', 'API_KEY_IP_ADDRESS_BLOCKED', 'SERVICE_DISABLED', 'BILLING_DISABLED', 'RATE_LIMIT_EXCEEDED', 'QUOTA_EXCEEDED']);
const networkCodes = new Set(['EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH', 'EPERM', 'EACCES', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT']);
export function inspectGeminiError(error) {
  let body;
  // Google SDK ApiError.message is normally serialized JSON. Inspect in memory only.
  if (typeof error?.message === 'string' && error.message.length < 100_000) {
    try { body = JSON.parse(error.message); } catch { /* Non-JSON messages are never logged. */ }
  }
  const provider = body?.error || body;
  const status = Number(error?.status || provider?.code || error?.code);
  const upstreamStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
  const providerStatus = statuses.has(provider?.status) ? provider.status : null;
  const providerReason = Array.isArray(provider?.details) ? provider.details.slice(0, 20).map(item => item?.reason).find(reason => reasons.has(reason)) || null : null;
  const pending = [error]; const seen = new Set(); let networkCode = null;
  while (pending.length && seen.size < 20) {
    const item = pending.shift();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    if (networkCodes.has(item.code)) { networkCode = item.code; break; }
    if (item.cause) pending.push(item.cause);
    if (Array.isArray(item.errors)) pending.push(...item.errors.slice(0, 10));
  }
  const category = ['EAI_AGAIN', 'ENOTFOUND'].includes(networkCode) ? 'dns'
    : /CERT|SIGNATURE|SELF_SIGNED/.test(networkCode || '') ? 'tls'
    : upstreamStatus === 429 ? 'quota_or_rate_limit'
    : [401,403].includes(upstreamStatus) || providerReason?.startsWith('API_KEY_') ? 'authentication_or_permission'
    : upstreamStatus === 404 ? 'model_or_endpoint_not_found'
    : upstreamStatus === 400 ? 'invalid_request'
    : [408,504].includes(upstreamStatus) || /TIMEOUT|ETIMEDOUT/.test(networkCode || '') || ['TimeoutError','AbortError'].includes(error?.name) ? 'timeout_or_abort'
    : networkCode ? 'network'
    : upstreamStatus >= 500 ? 'upstream_failure' : 'sdk_or_unknown';
  const messages = {
    dns: 'DNS resolution failed before receiving an HTTP response.',
    tls: 'TLS certificate verification failed.',
    quota_or_rate_limit: 'Gemini rejected the request because of quota or rate limits.',
    authentication_or_permission: 'Gemini rejected API credentials or access permissions.',
    model_or_endpoint_not_found: 'Gemini model or endpoint was not found for this request.',
    invalid_request: 'Gemini rejected the request parameters.',
    timeout_or_abort: 'The request timed out or was aborted.',
    network: 'Transport connection failed.',
    upstream_failure: 'Gemini returned an upstream server failure.',
    sdk_or_unknown: 'SDK failure without a recognized upstream status or transport code.',
  };
  const sdkErrorType = ['Error', 'TypeError', 'RangeError', 'ApiError', 'FetchError', 'TimeoutError', 'AbortError', 'AggregateError'].includes(error?.name) ? error.name : 'UNKNOWN';
  return { upstreamStatus, providerStatus, providerReason, networkCode, sdkErrorType, category, sanitizedMessage: messages[category] };
}
