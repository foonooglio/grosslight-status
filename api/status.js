const fs = require('fs/promises');
const path = require('path');

async function loadStatusData() {
  const filePath = path.join(process.cwd(), 'status-data.json');
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    const data = await loadStatusData();
    res.status(200).json({
      ...data,
      generatedAt: new Date().toISOString(),
      apiMode: 'safe-static-status'
    });
  } catch (error) {
    res.status(500).json({
      error: 'status_data_unavailable',
      message: 'Unable to load local status data.',
      generatedAt: new Date().toISOString()
    });
  }
};
