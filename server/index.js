import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadBackendEnvironment } from './env.js';

loadBackendEnvironment();

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('Local MVP must bind to loopback. Add authentication before exposing it.');
const server = createServer(createApp({
  port, apiKey: process.env.GEMINI_API_KEY?.trim() || '', model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  enableDemo: process.env.ENABLE_DEMO !== 'false', appOrigin: process.env.APP_ORIGIN || 'http://127.0.0.1:5173',
}));
server.requestTimeout = 60_000;
server.headersTimeout = 10_000;
server.on('error', error => {
  console.error(`Local server could not start (${error.code || 'UNKNOWN'}). Check local port/network permissions.`);
  process.exitCode = 1;
});
server.listen(port, host, () => console.log(`KapasMitra backend: http://${host}:${port} • ${process.env.GEMINI_API_KEY ? 'Gemini configured' : 'Live AI unavailable; explicit demo available'}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
