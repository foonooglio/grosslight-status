const {
  buildErrorResponse,
  buildMethodNotAllowedResponse,
  buildStatusResponse,
  loadAndValidateStatusData
} = require('../lib/status-contract');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if ((req.method || 'GET').toUpperCase() !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json(buildMethodNotAllowedResponse());
  }

  try {
    const data = await loadAndValidateStatusData();
    res.status(200).json(buildStatusResponse(data));
  } catch (error) {
    res.status(500).json(buildErrorResponse(error));
  }
};
