const path = require('path');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const nextFactory = require('next');

async function startWebServer({ webDir, webPort = 8080, apiPort }) {
  const dev = false;
  const next = nextFactory({ dev, dir: webDir });
  const handle = next.getRequestHandler();
  await next.prepare();

  const app = express();

  // Proxy API and WebSocket traffic to Python API server (register BEFORE Next catch-all)
  const portNum = Number(apiPort);
  let apiProxy;
  if (Number.isFinite(portNum) && portNum > 0) {
    const apiTarget = `http://127.0.0.1:${portNum}`;
    apiProxy = createProxyMiddleware({
      target: apiTarget,
      changeOrigin: true,
      ws: true,
      logLevel: 'warn'
    });
    app.use('/api', apiProxy);
  } else {
    console.warn('[Desktop] API port missing/invalid; starting Next without API proxy');
  }

  // Everything else handled by Next
  app.all('*', (req, res) => handle(req, res));

  // Create HTTP server and wire WS upgrade if proxy exists
  const http = require('http');
  const server = http.createServer(app);
  if (apiProxy && typeof apiProxy.upgrade === 'function') {
    server.on('upgrade', apiProxy.upgrade);
  }

  return new Promise((resolve, reject) => {
    server.listen(webPort, '127.0.0.1', () => {
      resolve({ server, url: `http://localhost:${webPort}` });
    });
    server.on('error', reject);
  });
}

module.exports = { startWebServer };
