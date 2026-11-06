import { ApiError } from './errors.js';

export function retryAfterSeconds(value, now = Date.now()) {
 if (typeof value !== 'string' || !value.trim()) return null;
 const text = value.trim();
 const seconds = /^\d+$/.test(text) ? Number(text) : /^[A-Za-z]{3}, /.test(text) ? Math.ceil((Date.parse(text) - now) / 1000) : NaN;
 return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : null;
}

// Provider bodies, credentials and arbitrary error codes never enter diagnostics.
export function accountRateError({source, providerCode, providerStatus, retryAfter = null, seconds = null}) {
 const allowed = ['over_email_send_rate_limit','over_request_rate_limit','over_sms_send_rate_limit'];
 const safeCode = allowed.includes(providerCode) ? providerCode : null;
 const retry = seconds ?? retryAfterSeconds(retryAfter);
 const code = source === 'backend' ? 'ACCOUNT_LOCAL_RATE' : safeCode === 'over_email_send_rate_limit' ? 'ACCOUNT_EMAIL_RATE' : 'ACCOUNT_PROVIDER_RATE';
 const message = code === 'ACCOUNT_LOCAL_RATE' ? 'Too many account attempts from this connection.' : code === 'ACCOUNT_EMAIL_RATE' ? 'Supabase has reached its confirmation email sending limit. If you already confirmed your email, use Log in. For new confirmations, the project owner must configure custom SMTP or wait for the email limit to reset.' : 'Supabase is limiting account requests. Please try again later.';
 const details = {source, providerCode:safeCode, ...(source === 'supabase' ? {providerStatus} : {}), retryAfterSeconds:retry};
 const error = new ApiError(429, code, message, {accountRate:details});
 error.accountRate = details;
 error.retryAfterSeconds = retry;
 return error;
}
