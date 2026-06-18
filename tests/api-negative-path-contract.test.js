const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const SERVER_PATH = path.join(REPO_ROOT, 'api-server.js');
const STATUS_HANDLER = require(path.join(REPO_ROOT, 'api', 'status.js'));
const HEALTH_HANDLER = require(path.join(REPO_ROOT, 'api', 'health.js'));
const ROADMAP_HANDLER = require(path.join(REPO_ROOT, 'api', 'roadmap.js'));
const STATUS_DATA_PATH = path.join(REPO_ROOT, 'status-data.json');

function assertIso(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string`);
  assert.notEqual(Number.isNaN(Date.parse(value)), true, `${label} must be an ISO timestamp`);
}

function assertSafeErrorShape(response, expectedStatus, expectedError, expectedMessage) {
  assert.equal(response.statusCode, expectedStatus);
  assert.equal(response.headers['access-control-allow-origin'], '*');
  assert.match(String(response.headers['cache-control']), /no-store/);
  assert.match(String(response.headers['content-type']), /application\/json/);
  assert.deepEqual(Object.keys(response.json).sort(), ['contractVersion', 'error', 'generatedAt', 'message']);
  assert.equal(response.json.contractVersion, 'status-api-v1');
  assert.equal(response.json.error, expectedError);
  assert.equal(response.json.message, expectedMessage);
  assertIso(response.json.generatedAt, 'generatedAt');

  const serialized = JSON.stringify(response.json);
  assert.doesNotMatch(serialized, /ENOENT|SyntaxError|Unexpected token|must be an array|must be a non-empty string|status-data\.json|\/home\//);
}

async function createWorkspace({ statusDataMode = 'valid' } = {}) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'grosslight-status-'));
  if (statusDataMode === 'valid') {
    await fs.copyFile(STATUS_DATA_PATH, path.join(workspace, 'status-data.json'));
  } else if (statusDataMode === 'malformed') {
    await fs.writeFile(path.join(workspace, 'status-data.json'), '{ invalid json\n', 'utf8');
  } else if (statusDataMode === 'invalid') {
    await fs.writeFile(
      path.join(workspace, 'status-data.json'),
      JSON.stringify({
        product: { title: 'Only title' },
        currentSprint: { id: 'S3' },
        roadmap: [],
        retainedEvidence: {},
        nextGate: {},
        operatingRules: []
      }, null, 2),
      'utf8'
    );
  }
  return workspace;
}

function requestJson(port, pathname, { method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: pathname,
        method
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, headers: res.headers, json: JSON.parse(body) });
          } catch (error) {
            reject(new Error(`Failed to parse JSON from ${method} ${pathname}: ${error.message}\n${body}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function startServer(workspace) {
  const port = 3300 + Math.floor(Math.random() * 2000);
  const server = spawn(process.execPath, [SERVER_PATH], {
    cwd: workspace,
    env: { ...process.env, PORT: String(port) },
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

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await requestJson(port, '/api/health');
      if (response.statusCode === 200) {
        return { port, server, stdoutRef: () => stdout, stderrRef: () => stderr };
      }
    } catch (error) {
      if (server.exitCode !== null) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Server failed to start.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
}

async function stopServer(serverHandle) {
  if (!serverHandle || serverHandle.server.exitCode !== null) return;
  serverHandle.server.kill('SIGTERM');
  await new Promise((resolve) => serverHandle.server.once('exit', resolve));
}

function createMockRes() {
  return {
    headers: {},
    statusCode: null,
    jsonBody: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      return this;
    }
  };
}

test('happy-path regression keeps approved contract responses intact', async (t) => {
  const workspace = await createWorkspace({ statusDataMode: 'valid' });
  const serverHandle = await startServer(workspace);
  t.after(async () => {
    await stopServer(serverHandle);
    await fs.rm(workspace, { recursive: true, force: true });
  });

  const status = await requestJson(serverHandle.port, '/api/status');
  const health = await requestJson(serverHandle.port, '/api/health');
  const roadmap = await requestJson(serverHandle.port, '/api/roadmap');

  assert.equal(status.statusCode, 200);
  assert.equal(status.json.contractVersion, 'status-api-v1');
  assert.equal(status.json.apiMode, 'safe-static-status');
  assert.ok(Array.isArray(status.json.roadmap));
  assert.equal(status.json.roadmap.length, 10);

  assert.equal(health.statusCode, 200);
  assert.equal(health.json.ok, true);
  assert.equal(health.json.service, 'grosslight-status');

  assert.equal(roadmap.statusCode, 200);
  assert.equal(roadmap.json.contractVersion, 'status-api-v1');
  assert.equal(roadmap.json.nextGate.id, 'S3');
  assert.ok(Array.isArray(roadmap.json.roadmap));
});

test('missing data source returns fixed safe unavailable error for status and roadmap', async (t) => {
  const workspace = await createWorkspace({ statusDataMode: 'missing' });
  const serverHandle = await startServer(workspace);
  t.after(async () => {
    await stopServer(serverHandle);
    await fs.rm(workspace, { recursive: true, force: true });
  });

  const status = await requestJson(serverHandle.port, '/api/status');
  const roadmap = await requestJson(serverHandle.port, '/api/roadmap');

  assertSafeErrorShape(status, 500, 'status_data_unavailable', 'Unable to load local status data.');
  assertSafeErrorShape(roadmap, 500, 'status_data_unavailable', 'Unable to load local status data.');
});

test('malformed JSON returns fixed safe unavailable error', async (t) => {
  const workspace = await createWorkspace({ statusDataMode: 'malformed' });
  const serverHandle = await startServer(workspace);
  t.after(async () => {
    await stopServer(serverHandle);
    await fs.rm(workspace, { recursive: true, force: true });
  });

  const status = await requestJson(serverHandle.port, '/api/status');
  assertSafeErrorShape(status, 500, 'status_data_unavailable', 'Unable to load local status data.');
});

test('schema-invalid local data returns fixed safe validation error', async (t) => {
  const workspace = await createWorkspace({ statusDataMode: 'invalid' });
  const serverHandle = await startServer(workspace);
  t.after(async () => {
    await stopServer(serverHandle);
    await fs.rm(workspace, { recursive: true, force: true });
  });

  const status = await requestJson(serverHandle.port, '/api/status');
  assertSafeErrorShape(status, 500, 'status_data_invalid', 'Status data failed validation.');
});

test('unknown endpoint returns safe not_found contract response', async (t) => {
  const workspace = await createWorkspace({ statusDataMode: 'valid' });
  const serverHandle = await startServer(workspace);
  t.after(async () => {
    await stopServer(serverHandle);
    await fs.rm(workspace, { recursive: true, force: true });
  });

  const response = await requestJson(serverHandle.port, '/api/nope');
  assertSafeErrorShape(response, 404, 'not_found', 'Endpoint not found.');
});

test('local server rejects method mismatch with safe 405 error', async (t) => {
  const workspace = await createWorkspace({ statusDataMode: 'valid' });
  const serverHandle = await startServer(workspace);
  t.after(async () => {
    await stopServer(serverHandle);
    await fs.rm(workspace, { recursive: true, force: true });
  });

  const response = await requestJson(serverHandle.port, '/api/status', { method: 'POST' });
  assertSafeErrorShape(response, 405, 'method_not_allowed', 'Method not allowed.');
});

test('serverless handlers reject method mismatch with same safe error shape', async () => {
  for (const handler of [STATUS_HANDLER, HEALTH_HANDLER, ROADMAP_HANDLER]) {
    const req = { method: 'POST' };
    const res = createMockRes();
    await handler(req, res);

    assert.equal(res.statusCode, 405);
    assert.equal(res.headers['access-control-allow-origin'], '*');
    assert.match(String(res.headers['cache-control']), /no-store/);
    assert.match(String(res.headers['content-type']), /application\/json/);
    assert.deepEqual(Object.keys(res.jsonBody).sort(), ['contractVersion', 'error', 'generatedAt', 'message']);
    assert.equal(res.jsonBody.contractVersion, 'status-api-v1');
    assert.equal(res.jsonBody.error, 'method_not_allowed');
    assert.equal(res.jsonBody.message, 'Method not allowed.');
    assertIso(res.jsonBody.generatedAt, 'generatedAt');
  }
});
