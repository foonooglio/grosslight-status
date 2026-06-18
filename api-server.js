const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const {
  buildErrorResponse,
  buildHealthResponse,
  buildMethodNotAllowedResponse,
  buildNotFoundResponse,
  buildRoadmapResponse,
  buildServerErrorResponse,
  buildStatusResponse,
  loadAndValidateStatusData
} = require('./lib/status-contract');

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

function isGetMethod(req) {
  return (req.method || 'GET').toUpperCase() === 'GET';
}

async function handleStatusRequest(res) {
  const data = await loadAndValidateStatusData();
  return sendJson(res, 200, buildStatusResponse(data));
}

async function handleRoadmapRequest(res) {
  const data = await loadAndValidateStatusData();
  return sendJson(res, 200, buildRoadmapResponse(data));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === '/api/status') {
      if (!isGetMethod(req)) {
        res.setHeader('Allow', 'GET');
        return sendJson(res, 405, buildMethodNotAllowedResponse());
      }
      try {
        return await handleStatusRequest(res);
      } catch (error) {
        return sendJson(res, 500, buildErrorResponse(error));
      }
    }

    if (url.pathname === '/api/health') {
      if (!isGetMethod(req)) {
        res.setHeader('Allow', 'GET');
        return sendJson(res, 405, buildMethodNotAllowedResponse());
      }
      return sendJson(res, 200, buildHealthResponse());
    }

    if (url.pathname === '/api/roadmap') {
      if (!isGetMethod(req)) {
        res.setHeader('Allow', 'GET');
        return sendJson(res, 405, buildMethodNotAllowedResponse());
      }
      try {
        return await handleRoadmapRequest(res);
      } catch (error) {
        return sendJson(res, 500, buildErrorResponse(error));
      }
    }

    if (url.pathname.startsWith('/api/')) {
      return sendJson(res, 404, buildNotFoundResponse());
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return await serveStatic(res, 'index.html');
    }

    const staticPath = url.pathname.replace(/^\//, '');
    return await serveStatic(res, staticPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return sendJson(res, 404, buildNotFoundResponse());
    }

    return sendJson(res, 500, buildServerErrorResponse());
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Buu status server running at http://127.0.0.1:${PORT}`);
});
