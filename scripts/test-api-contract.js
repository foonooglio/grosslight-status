const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs/promises');
const path = require('path');

const PORT = Number(process.env.STATUS_TEST_PORT || 3210);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const STATUS_DATA_PATH = path.join(process.cwd(), 'status-data.json');

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

async function withStatusDataMutation(mutator, callback) {
  const original = await fs.readFile(STATUS_DATA_PATH, 'utf8');

  try {
    const nextValue = await mutator(original);
    await fs.writeFile(STATUS_DATA_PATH, nextValue, 'utf8');
    return await callback();
  } finally {
    await fs.writeFile(STATUS_DATA_PATH, original, 'utf8');
  }
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

    const invalidStatus = await withStatusDataMutation(
      (original) => original.replace('"surface": "status.grosslightconsulting.com"', '"surface": ""'),
      async () => requestJson('/api/status')
    );
    assert(invalidStatus.statusCode === 500, 'invalid status-data /api/status must return HTTP 500');
    assert(invalidStatus.json.contractVersion === 'status-api-v1', 'invalid /api/status must expose contractVersion');
    assert(invalidStatus.json.error === 'status_data_invalid', 'invalid /api/status must expose status_data_invalid');
    assert(invalidStatus.json.message === 'Status data failed validation.', 'invalid /api/status must use fixed public message');
    assertIso(invalidStatus.json.generatedAt, 'invalid /api/status generatedAt');
    assert(!invalidStatus.json.message.includes('product.surface'), 'invalid /api/status must not leak validator details');

    const invalidRoadmap = await withStatusDataMutation(
      (original) => original.replace('"surface": "status.grosslightconsulting.com"', '"surface": ""'),
      async () => requestJson('/api/roadmap')
    );
    assert(invalidRoadmap.statusCode === 500, 'invalid status-data /api/roadmap must return HTTP 500');
    assert(invalidRoadmap.json.contractVersion === 'status-api-v1', 'invalid /api/roadmap must expose contractVersion');
    assert(invalidRoadmap.json.error === 'status_data_invalid', 'invalid /api/roadmap must expose status_data_invalid');
    assert(invalidRoadmap.json.message === 'Status data failed validation.', 'invalid /api/roadmap must use fixed public message');
    assertIso(invalidRoadmap.json.generatedAt, 'invalid /api/roadmap generatedAt');
    assert(!invalidRoadmap.json.message.includes('product.surface'), 'invalid /api/roadmap must not leak validator details');

    const serverError = await requestJson('/icons');
    assert(serverError.statusCode === 500, 'unexpected server error path must return HTTP 500');
    assert(serverError.json.contractVersion === 'status-api-v1', 'server_error must expose contractVersion');
    assert(serverError.json.error === 'server_error', 'unexpected server error path must expose server_error');
    assert(serverError.json.message === 'Internal server error.', 'server_error must use fixed public message');
    assertIso(serverError.json.generatedAt, 'server_error generatedAt');
    assert(!/EISDIR|ENOENT|\//.test(serverError.json.message), 'server_error must not leak internal error text or paths');

    console.log('API contract test passed');
    console.log(`- base url: ${BASE_URL}`);
    console.log(`- /api/status keys: ${Object.keys(status.json).join(', ')}`);
    console.log(`- /api/health payload: ${JSON.stringify(health.json)}`);
    console.log(`- /api/roadmap tracks: ${roadmap.json.roadmap.length}`);
    console.log(`- invalid /api/status payload: ${JSON.stringify(invalidStatus.json)}`);
    console.log(`- invalid /api/roadmap payload: ${JSON.stringify(invalidRoadmap.json)}`);
    console.log(`- /icons server_error payload: ${JSON.stringify(serverError.json)}`);
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
