import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

const root = join(process.cwd(), 'dist');
const port = Number(process.env.PORT ?? 4173);
const host = '127.0.0.1';

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function insideRoot(file) {
  const resolved = normalize(file);
  return resolved === root || resolved.startsWith(`${root}${sep}`);
}

function resolveFile(urlPath) {
  let pathname = '/';
  try {
    pathname = decodeURIComponent((urlPath ?? '/').split('?')[0] ?? '/');
  } catch {
    return null;
  }
  // The exported site has no index document; the first tab is /today.
  const relativePath = pathname === '/' ? 'today' : pathname.replace(/^\/+/, '');
  const candidate = normalize(join(root, relativePath));
  if (!insideRoot(candidate)) {
    return null;
  }

  const options = [candidate];
  if (!extname(candidate)) {
    options.push(`${candidate}.html`, join(candidate, 'index.html'));
  }

  for (const file of options) {
    if (insideRoot(file) && existsSync(file) && statSync(file).isFile()) {
      return file;
    }
  }

  if (!extname(candidate)) {
    const fallback = join(root, 'index.html');
    if (existsSync(fallback)) {
      return fallback;
    }
  }
  return null;
}

const server = createServer((request, response) => {
  const file = resolveFile(request.url);
  if (!file) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  const type = MIME[extname(file)] ?? 'application/octet-stream';
  response.writeHead(200, {
    'Content-Type': type,
    // Web SQLite (expo-sqlite / wa-sqlite) needs SharedArrayBuffer, which requires cross-origin isolation.
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
  });
  createReadStream(file).pipe(response);
});

server.listen(port, host, () => {
  process.stdout.write(`Serving ${root} at http://${host}:${port}\n`);
});
