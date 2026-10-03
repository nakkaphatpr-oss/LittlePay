import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import handler from '../api/ledger.js';
const root = resolve('public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const headers = JSON.parse(await readFile('vercel.json', 'utf8')).headers[0].headers;
http.createServer(async (req, res) => {
  for (const { key, value } of headers) res.setHeader(key, value);
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/ledger') {
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 65000) { res.writeHead(413).end(); return; } }
    req.body = body || undefined;
    res.status = code => { res.statusCode = code; return res; };
    res.json = value => res.end(JSON.stringify(value));
    return handler(req, res);
  }
  try {
    const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const content = await readFile(path);
    res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream'); res.end(content);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(3000, '127.0.0.1', () => console.log('Open http://127.0.0.1:3000'));
