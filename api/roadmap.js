const {
  buildErrorResponse,
  buildRoadmapResponse,
  loadAndValidateStatusData
} = require('../lib/status-contract');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    const data = await loadAndValidateStatusData();
    res.status(200).json(buildRoadmapResponse(data));
  } catch (error) {
    res.status(500).json(buildErrorResponse(error));
  }
};
