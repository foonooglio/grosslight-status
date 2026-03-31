const http = require('http');
const https = require('https');
const { execSync } = require('child_process');
const net = require('net');

const PORT = 3200;

function checkPort(port) {
  return new Promise(resolve => {
    const sock = new net.Socket();
    sock.setTimeout(2000);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('error', () => resolve(false));
    sock.on('timeout', () => resolve(false));
    sock.connect(port, '127.0.0.1');
  });
}

function checkUrl(url) {
  return new Promise(resolve => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 5000 }, res => {
      resolve(res.statusCode);
      res.resume();
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => { req.destroy(); resolve(0); });
  });
}

function getVaultCommits() {
  try {
    const out = execSync(
      'cd /home/charles/vaults/obsidian-working && git log -5 --format="%ar|%s"',
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
    return out.split('\n').map(l => {
      const [time, ...msg] = l.split('|');
      return { time: time.trim(), message: msg.join('|').trim() };
    });
  } catch { return []; }
}

async function getStatus() {
  const [gateway, briefBuilder] = await Promise.all([
    checkPort(18789),
    checkPort(3100),
  ]);

  const subdomains = {};
  const checks = [
    ['iglesiasdairy', 'https://iglesiasdairy.grosslightconsulting.com'],
    ['app', 'https://app.grosslightconsulting.com'],
    ['backlog', 'https://backlog.grosslightconsulting.com'],
  ];
  for (const [name, url] of checks) {
    subdomains[name] = await checkUrl(url);
  }

  return {
    gateway: gateway ? 'online' : 'offline',
    briefBuilder: briefBuilder ? 'online' : 'offline',
    commits: getVaultCommits(),
    subdomains,
    timestamp: new Date().toISOString(),
  };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/status') {
    const data = await getStatus();
    res.end(JSON.stringify(data));
  } else {
    res.writeHead(404);
    res.end('{}');
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`Status API running on port ${PORT}`));
