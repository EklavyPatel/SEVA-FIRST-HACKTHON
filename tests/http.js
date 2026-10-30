import { Readable, Writable } from 'node:stream';
import { finished } from 'node:stream/promises';

export async function callHandler(app, { path = '/api/analyze', method = 'POST', body, headers = {} } = {}) {
  const req = Readable.from(method === 'POST' ? [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))] : []);
  req.method = method; req.url = path;
  req.headers = { host: '127.0.0.1:3001', 'content-type': 'application/json', origin: 'http://127.0.0.1:5173', ...headers };
  req.socket = { remoteAddress: '127.0.0.1' };
  const chunks = []; const responseHeaders = {};
  const res = new Writable({ write(chunk, encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
  res.setHeader = (key, value) => { responseHeaders[key.toLowerCase()] = value; };
  res.writeHead = (status, values = {}) => { res.statusCode = status; for (const [key,value] of Object.entries(values)) res.setHeader(key,value); };
  await app(req, res); await finished(res);
  const text = Buffer.concat(chunks).toString();
  return { status: res.statusCode, headers: responseHeaders, text,
    body: responseHeaders['content-type']?.startsWith('application/json') ? JSON.parse(text) : text };
}
