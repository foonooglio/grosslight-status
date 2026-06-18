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
  const data = JSON.parse(read('status-data.json'));
  const html = read('index.html');
  const api = read('api/status.js');
  const manifest = JSON.parse(read('manifest.webmanifest'));

  assert(Array.isArray(data.roadmap), 'roadmap must be an array');
  assert(data.roadmap.length === 10, 'roadmap must include S1 through S10');
  assert(data.roadmap[0].id === 'S1', 'roadmap should begin with S1');
  assert(data.roadmap[9].id === 'S10', 'roadmap should end with S10');
  assert(data.retainedEvidence.id === 'R4-K', 'retained evidence must be R4-K');
  assert(data.retainedEvidence.verdict.toLowerCase().includes('cautions'), 'R4-K verdict must mention cautions');
  assert(data.nextGate.id === 'S3', 'next gate should be S3');

  assert(!api.includes('CLOUDFLARE_TOKEN ||'), 'api/status.js must not contain a hardcoded Cloudflare token fallback pattern');
  assert(!api.includes('cfut_'), 'api/status.js must not contain a raw Cloudflare token literal');
  assert(!html.includes('Akumetsu — System Status'), 'index.html title/content must not keep the stale Akumetsu page title');
  assert(html.includes('Canonical Plan V2'), 'index.html must mention Canonical Plan V2');
  assert(html.includes('manifest.webmanifest'), 'index.html must link the web manifest');
  assert(manifest.name.includes('Buu'), 'manifest should describe the Buu status app');
  assert(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest must declare at least one icon');

  console.log('Validation passed');
  console.log(`- roadmap entries: ${data.roadmap.length}`);
  console.log(`- current sprint: ${data.currentSprint.id}`);
  console.log(`- next gate: ${data.nextGate.id} ${data.nextGate.title}`);
  console.log(`- retained evidence: ${data.retainedEvidence.id} / ${data.retainedEvidence.verdict}`);
  console.log('- hardcoded Cloudflare fallback removed');
}

main();
