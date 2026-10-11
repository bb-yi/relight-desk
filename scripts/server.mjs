import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { manifest, projectRoot, modelDirectory } from './models.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const modelFiles = new Set(manifest.files.map(file => `/models/${manifest.id}/${file.path}`));
export function safePath(root, path) {
  if (path.includes('\\') || path.includes('\0') || path.split('/').includes('..')) return null;
  const target = resolve(root, `.${path}`), rel = relative(root, target);
  return rel.startsWith('..') || isAbsolute(rel) ? null : target;
}
async function sendFile(req, res, root, target) {
  try {
    const [base, actual] = await Promise.all([realpath(root), realpath(target)]);
    const rel = relative(base, actual);
    if (rel.startsWith('..') || isAbsolute(rel)) { res.writeHead(403);res.end();return; }
    const info = await stat(actual);
    if (!info.isFile()) throw Object.assign(new Error('Not a file'), { code: 'ENOENT' });
    res.writeHead(200, { 'Content-Type': types[extname(actual)] || 'application/octet-stream', 'Content-Length': info.size,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') { res.end();return; }
    createReadStream(actual).on('error', () => res.destroy()).pipe(res);
  } catch (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 500);res.end('File unavailable'); }
}
// Read-only allowlisted model routes. No image upload or inference endpoint.
export function modelMiddleware(root = modelDirectory()) {
  return (req, res, next) => {
    let path;
    try { path = decodeURIComponent((req.url || '/').split('?')[0]); } catch { res.writeHead(400);res.end();return; }
    if (!path.startsWith('/models/')) { next();return; }
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405);res.end();return; }
    if (!modelFiles.has(path)) { res.writeHead(404);res.end();return; }
    const target = safePath(root, path.slice('/models'.length));
    if (!target) { res.writeHead(403);res.end();return; }
    void sendFile(req, res, root, target);
  };
}
export function createAppServer({ dist = resolve(projectRoot, 'dist'), models = modelDirectory() } = {}) {
  const model = modelMiddleware(models);
  return createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405);res.end();return; }
    model(req, res, () => {
      let path;
      try { path = decodeURIComponent((req.url || '/').split('?')[0]); } catch { res.writeHead(400);res.end();return; }
      if (path === '/healthz') { res.writeHead(200, {'Content-Type':'application/json'});res.end('{"app":"relight-desk","status":"ok"}');return; }
      if (path === '/') path = '/index.html';
      const target = safePath(dist, path);
      if (!target || path.split('/').some(part => part.startsWith('.'))) { res.writeHead(403);res.end();return; }
      void sendFile(req, res, dist, target);
    });
  });
}
