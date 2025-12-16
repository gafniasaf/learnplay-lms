import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, 'dist');
const port = parseInt(process.env.PORT || '8080', 10);
const host = '0.0.0.0';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  if (body) res.end(body);
  else res.end();
}

const server = http.createServer((req, res) => {
  try {
    const reqUrl = new URL(req.url || '/', `http://${req.headers.host}`);
    let pathname = decodeURIComponent(reqUrl.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    // Important on Windows: `path.join(distDir, "/assets/...")` can ignore `distDir`.
    // Strip leading slashes so we always resolve under dist/.
    pathname = pathname.replace(/^\/+/, '');

    // Basic traversal guard
    if (pathname.includes('..')) {
      send(res, 400, { 'Content-Type': 'text/plain' }, 'Bad Request');
      return;
    }

    const filePath = path.join(distDir, pathname);
    const exists = fs.existsSync(filePath) && fs.statSync(filePath).isFile();

    if (exists) {
      const ext = path.extname(filePath).toLowerCase();
      const type = mime[ext] || 'application/octet-stream';
      const cache =
        ext === '.html'
          ? 'no-cache'
          : 'public, max-age=31536000, immutable';
      const stream = fs.createReadStream(filePath);
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache });
      stream.pipe(res);
      return;
    }

    // SPA fallback to index.html
    const indexPath = path.join(distDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath);
      send(res, 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }, html);
      return;
    }

    send(res, 404, { 'Content-Type': 'text/plain' }, 'Not Found');
  } catch (e) {
    send(res, 500, { 'Content-Type': 'text/plain' }, 'Internal Server Error');
  }
});

server.listen(port, host, () => {
  console.log(`Static server running at http://${host}:${port} → ${distDir}`);
});


