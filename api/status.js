const http = require('http');
const https = require('https');
const net = require('net');
const { execSync } = require('child_process');

function checkPort(host, port) {
  return new Promise(resolve => {
    const sock = new net.Socket();
    sock.setTimeout(3000);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('error', () => resolve(false));
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
    sock.connect(port, host);
  });
}

function checkUrl(url) {
  return new Promise(resolve => {
    const mod = url.startsWith('https') ? https : http;
    try {
      const req = mod.get(url, { timeout: 5000 }, res => {
        resolve(res.statusCode);
        res.resume();
      });
      req.on('error', () => resolve(0));
      req.setTimeout(5000, () => { req.destroy(); resolve(0); });
    } catch { resolve(0); }
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const VPS = '178.156.168.207';

  const [gateway, briefBuilder] = await Promise.all([
    checkPort(VPS, 18789),
    checkPort(VPS, 3100),
  ]);

  const subdomainChecks = await Promise.all([
    checkUrl('https://app.grosslightconsulting.com'),
    checkUrl('https://iglesiasdairy.grosslightconsulting.com'),
    checkUrl('https://backlog.grosslightconsulting.com'),
    checkUrl('https://status.grosslightconsulting.com'),
  ]);

  // Get last deploy times from Vercel API
  const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN;
  const projectDeployTimes = {};
  const projectMap = {
    'grosslight-app': 'app',
    'iglesias-dairy': 'iglesiasdairy',
    'grosslight-backlog': 'backlog',
    'grosslight-status': 'status',
  };
  try {
    const deployRes = await new Promise((resolve, reject) => {
      const opts = {
        hostname: 'api.vercel.com',
        path: '/v6/deployments?limit=20&state=READY',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}` },
      };
      const req = https.request(opts, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });
    const deployments = deployRes.deployments || [];
    for (const dep of deployments) {
      const name = dep.name;
      const key = projectMap[name];
      if (key && !projectDeployTimes[key]) {
        projectDeployTimes[key] = dep.createdAt;
      }
    }
  } catch { /* silent */ }

  // Get vault commits from VPS status API
  let commits = [];
  try {
    const vpsData = await new Promise((resolve, reject) => {
      const req = http.get(`http://${VPS}:3200/api/status`, { timeout: 5000 }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    });
    commits = vpsData.commits || [];
  } catch { commits = []; }

  res.status(200).json({
    gateway: gateway ? 'online' : 'offline',
    briefBuilder: briefBuilder ? 'online' : 'offline',
    subdomains: {
      app: subdomainChecks[0],
      iglesiasdairy: subdomainChecks[1],
      backlog: subdomainChecks[2],
      status: subdomainChecks[3],
    },
    deployTimes: projectDeployTimes,
    commits,
    timestamp: new Date().toISOString(),
  });
}
