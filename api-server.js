const http = require('http');
const fs = require('fs/promises');
const path = require('path');

const PORT = process.env.PORT || 3200;
const ROOT = process.cwd();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

async function loadStatusData() {
  const raw = await fs.readFile(path.join(ROOT, 'status-data.json'), 'utf8');
  return JSON.parse(raw);
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(body, null, 2));
}

async function serveStatic(res, relativePath) {
  const filePath = path.join(ROOT, relativePath);
  const ext = path.extname(filePath);
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
  const content = await fs.readFile(filePath);
  res.writeHead(200, {
    'Content-Type': mimeType,
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=300'
  });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === '/api/status') {
      const data = await loadStatusData();
      return sendJson(res, 200, {
        ...data,
        generatedAt: new Date().toISOString(),
        apiMode: 'safe-static-status'
      });
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return serveStatic(res, 'index.html');
    }

    const staticPath = url.pathname.replace(/^\//, '');
    return serveStatic(res, staticPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return sendJson(res, 404, { error: 'not_found' });
    }

    return sendJson(res, 500, {
      error: 'server_error',
      message: error.message,
      generatedAt: new Date().toISOString()
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Buu status server running at http://127.0.0.1:${PORT}`);
});
