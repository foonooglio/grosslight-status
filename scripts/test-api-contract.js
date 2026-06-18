const { spawn } = require('child_process');
const http = require('http');

const PORT = Number(process.env.STATUS_TEST_PORT || 3210);
const BASE_URL = `http://127.0.0.1:${PORT}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requestJson(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE_URL}${pathname}`, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ statusCode: res.statusCode, headers: res.headers, json });
        } catch (error) {
          reject(new Error(`Failed to parse JSON from ${pathname}: ${error.message}\n${body}`));
        }
      });
    });
    req.on('error', reject);
  });
}

async function waitForServer(maxAttempts = 40) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await requestJson('/api/health');
      if (response.statusCode === 200) {
        return;
      }
    } catch (error) {
      if (attempt === maxAttempts) throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error('Server did not become ready in time');
}

function assertIso(value, label) {
  assert(typeof value === 'string', `${label} must be a string`);
  assert(!Number.isNaN(Date.parse(value)), `${label} must be a valid ISO timestamp`);
}

async function main() {
  const server = spawn(process.execPath, ['api-server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  server.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  server.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer();

    const status = await requestJson('/api/status');
    const health = await requestJson('/api/health');
    const roadmap = await requestJson('/api/roadmap');

    [status, health, roadmap].forEach((response, index) => {
      assert(response.statusCode === 200, `endpoint ${index} must return HTTP 200`);
      assert(response.headers['access-control-allow-origin'] === '*', 'CORS header must allow *');
      assert(String(response.headers['cache-control']).includes('no-store'), 'Cache-Control must include no-store');
    });

    assert(status.json.contractVersion === 'status-api-v1', '/api/status must expose contractVersion');
    assertIso(status.json.generatedAt, '/api/status generatedAt');
    assert(status.json.apiMode === 'safe-static-status', '/api/status apiMode must be safe-static-status');
    ['product', 'currentSprint', 'roadmap', 'retainedEvidence', 'nextGate', 'operatingRules'].forEach((key) => {
      assert(Object.prototype.hasOwnProperty.call(status.json, key), `/api/status missing ${key}`);
    });

    assert(health.json.contractVersion === 'status-api-v1', '/api/health must expose contractVersion');
    assert(health.json.ok === true, '/api/health ok must be true');
    assert(health.json.service === 'grosslight-status', '/api/health service must be grosslight-status');
    assertIso(health.json.generatedAt, '/api/health generatedAt');

    assert(roadmap.json.contractVersion === 'status-api-v1', '/api/roadmap must expose contractVersion');
    assertIso(roadmap.json.generatedAt, '/api/roadmap generatedAt');
    assert(Array.isArray(roadmap.json.roadmap), '/api/roadmap roadmap must be an array');
    assert(roadmap.json.roadmap.length === 10, '/api/roadmap roadmap must contain 10 tracks');
    assert(roadmap.json.nextGate && roadmap.json.nextGate.id === 'S3', '/api/roadmap nextGate must remain S3');
    assert(!Object.prototype.hasOwnProperty.call(roadmap.json, 'product'), '/api/roadmap must not include product');
    assert(!Object.prototype.hasOwnProperty.call(roadmap.json, 'retainedEvidence'), '/api/roadmap must not include retainedEvidence');

    console.log('API contract test passed');
    console.log(`- base url: ${BASE_URL}`);
    console.log(`- /api/status keys: ${Object.keys(status.json).join(', ')}`);
    console.log(`- /api/health payload: ${JSON.stringify(health.json)}`);
    console.log(`- /api/roadmap tracks: ${roadmap.json.roadmap.length}`);
  } finally {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
    if (stdout.trim()) {
      console.log('- server stdout captured during test:');
      console.log(stdout.trim());
    }
    if (stderr.trim()) {
      console.log('- server stderr captured during test:');
      console.log(stderr.trim());
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
