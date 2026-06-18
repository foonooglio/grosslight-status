const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const CONTRACT_VERSION = 'status-api-v1';
const API_MODE = 'safe-static-status';
const SERVICE_NAME = 'grosslight-status';
const ROOT = process.cwd();
const DATA_PATH = path.join(ROOT, 'status-data.json');

function isoNow() {
  return new Date().toISOString();
}

function readJsonSync(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function loadStatusData() {
  const raw = await fsp.readFile(DATA_PATH, 'utf8');
  return JSON.parse(raw);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function assert(condition, message) {
  if (!condition) {
    const error = new Error(message);
    error.code = 'STATUS_DATA_INVALID';
    throw error;
  }
}

function assertStringArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  value.forEach((item, index) => {
    assert(isNonEmptyString(item), `${label}[${index}] must be a non-empty string`);
  });
}

function assertObject(value, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
}

function validateRoadmapTrack(track, index) {
  assertObject(track, `roadmap[${index}]`);
  ['id', 'title', 'state', 'label', 'summary'].forEach((key) => {
    assert(isNonEmptyString(track[key]), `roadmap[${index}].${key} must be a non-empty string`);
  });
  assertStringArray(track.focus, `roadmap[${index}].focus`);
}

function validateStatusData(data) {
  assertObject(data, 'status data');

  assertObject(data.product, 'product');
  ['title', 'subtitle', 'owner', 'surface'].forEach((key) => {
    assert(isNonEmptyString(data.product[key]), `product.${key} must be a non-empty string`);
  });

  assertObject(data.currentSprint, 'currentSprint');
  ['id', 'title', 'state', 'badge', 'summary', 'statusLine'].forEach((key) => {
    assert(isNonEmptyString(data.currentSprint[key]), `currentSprint.${key} must be a non-empty string`);
  });
  assertStringArray(data.currentSprint.checkpoints, 'currentSprint.checkpoints');

  assert(Array.isArray(data.roadmap), 'roadmap must be an array');
  assert(data.roadmap.length === 10, 'roadmap must include S1 through S10');
  data.roadmap.forEach(validateRoadmapTrack);

  assertObject(data.retainedEvidence, 'retainedEvidence');
  ['id', 'verdict', 'summary'].forEach((key) => {
    assert(isNonEmptyString(data.retainedEvidence[key]), `retainedEvidence.${key} must be a non-empty string`);
  });
  assertStringArray(data.retainedEvidence.confirmed, 'retainedEvidence.confirmed');
  assertStringArray(data.retainedEvidence.cautions, 'retainedEvidence.cautions');

  assertObject(data.nextGate, 'nextGate');
  ['id', 'title', 'status', 'summary'].forEach((key) => {
    assert(isNonEmptyString(data.nextGate[key]), `nextGate.${key} must be a non-empty string`);
  });
  assertStringArray(data.nextGate.reasons, 'nextGate.reasons');

  assertStringArray(data.operatingRules, 'operatingRules');

  return data;
}

async function loadAndValidateStatusData() {
  const data = await loadStatusData();
  return validateStatusData(data);
}

function buildStatusResponse(data, generatedAt = isoNow()) {
  return {
    contractVersion: CONTRACT_VERSION,
    generatedAt,
    apiMode: API_MODE,
    product: data.product,
    currentSprint: data.currentSprint,
    roadmap: data.roadmap,
    retainedEvidence: data.retainedEvidence,
    nextGate: data.nextGate,
    operatingRules: data.operatingRules
  };
}

function buildHealthResponse(generatedAt = isoNow()) {
  return {
    contractVersion: CONTRACT_VERSION,
    ok: true,
    service: SERVICE_NAME,
    generatedAt
  };
}

function buildRoadmapResponse(data, generatedAt = isoNow()) {
  return {
    contractVersion: CONTRACT_VERSION,
    generatedAt,
    roadmap: data.roadmap,
    nextGate: data.nextGate
  };
}

function buildErrorResponse(error, fallbackMessage = 'Unable to load local status data.', generatedAt = isoNow()) {
  const isInvalid = error && error.code === 'STATUS_DATA_INVALID';
  return {
    contractVersion: CONTRACT_VERSION,
    error: isInvalid ? 'status_data_invalid' : 'status_data_unavailable',
    message: isInvalid ? error.message : fallbackMessage,
    generatedAt
  };
}

module.exports = {
  API_MODE,
  CONTRACT_VERSION,
  DATA_PATH,
  ROOT,
  SERVICE_NAME,
  buildErrorResponse,
  buildHealthResponse,
  buildRoadmapResponse,
  buildStatusResponse,
  loadAndValidateStatusData,
  readJsonSync,
  validateStatusData
};
