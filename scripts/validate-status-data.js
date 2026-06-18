const {
  CONTRACT_VERSION,
  DATA_PATH,
  readJsonSync,
  validateStatusData
} = require('../lib/status-contract');
const fs = require('fs');
const path = require('path');

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const data = validateStatusData(readJsonSync(DATA_PATH));
  const html = read('index.html');
  const statusApi = read('api/status.js');
  const healthApi = read('api/health.js');
  const roadmapApi = read('api/roadmap.js');
  const server = read('api-server.js');
  const contract = read('lib/status-contract.js');
  const manifest = JSON.parse(read('manifest.webmanifest'));

  assert(data.roadmap[0].id === 'S1', 'roadmap should begin with S1');
  assert(data.roadmap[9].id === 'S10', 'roadmap should end with S10');
  assert(data.retainedEvidence.id === 'R4-K', 'retained evidence must be R4-K');
  assert(data.retainedEvidence.verdict.toLowerCase().includes('cautions'), 'R4-K verdict must mention cautions');
  assert(data.nextGate.id === 'S3', 'next gate should be S3');

  assert(contract.includes(`CONTRACT_VERSION = '${CONTRACT_VERSION}'`) || contract.includes(`CONTRACT_VERSION = "${CONTRACT_VERSION}"`), 'shared contract module must define status-api-v1');
  assert(server.includes('/api/status'), 'api-server.js must expose /api/status');
  assert(server.includes('/api/health'), 'api-server.js must expose /api/health');
  assert(server.includes('/api/roadmap'), 'api-server.js must expose /api/roadmap');
  assert(statusApi.includes('buildStatusResponse'), 'api/status.js must use shared status response builder');
  assert(healthApi.includes('buildHealthResponse'), 'api/health.js must use shared health response builder');
  assert(roadmapApi.includes('buildRoadmapResponse'), 'api/roadmap.js must use shared roadmap response builder');

  assert(!contract.includes('process.env'), 'shared contract module must not inspect environment variables');
  assert(!statusApi.includes('CLOUDFLARE_TOKEN ||'), 'api/status.js must not contain a hardcoded Cloudflare token fallback pattern');
  assert(!statusApi.includes('cfut_'), 'api/status.js must not contain a raw Cloudflare token literal');
  assert(!server.includes('fetch('), 'api-server.js must not introduce provider/network fetch calls');
  assert(!contract.includes('fetch('), 'shared contract module must not introduce provider/network fetch calls');
  assert(!server.toLowerCase().includes('psql'), 'api-server.js must not introduce psql usage');
  assert(!contract.toLowerCase().includes('psql'), 'shared contract module must not introduce psql usage');
  assert(!html.includes('Akumetsu — System Status'), 'index.html title/content must not keep the stale Akumetsu page title');
  assert(html.includes('Canonical Plan V2'), 'index.html must mention Canonical Plan V2');
  assert(html.includes('manifest.webmanifest'), 'index.html must link the web manifest');
  assert(manifest.name.includes('Buu'), 'manifest should describe the Buu status app');
  assert(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest must declare at least one icon');

  console.log('Validation passed');
  console.log(`- contract version: ${CONTRACT_VERSION}`);
  console.log(`- data source: ${DATA_PATH}`);
  console.log(`- roadmap entries: ${data.roadmap.length}`);
  console.log(`- current sprint: ${data.currentSprint.id}`);
  console.log(`- next gate: ${data.nextGate.id} ${data.nextGate.title}`);
  console.log(`- retained evidence: ${data.retainedEvidence.id} / ${data.retainedEvidence.verdict}`);
  console.log('- endpoints declared: /api/status, /api/health, /api/roadmap');
  console.log('- provider/network calls in API path: none detected');
  console.log('- database coupling in API path: none detected');
  console.log('- hardcoded Cloudflare fallback removed');
}

main();
