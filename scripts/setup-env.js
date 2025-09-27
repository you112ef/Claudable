#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const envFile = path.join(rootDir, '.env');
const webEnvFile = path.join(rootDir, 'apps', 'web', '.env.local');

// Default ports
const DEFAULT_API_PORT = 8080;
const DEFAULT_WEB_PORT = 3000;

// Robust check: consider a port unavailable if a TCP connection succeeds
// This avoids false positives when another process bound the port with SO_REUSEPORT
function isPortAvailable(port) {
  const tryConnect = (host) => new Promise((resolve) => {
    const socket = net.connect({ port, host });
    let settled = false;

    const finish = (available) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch (_) {}
      resolve(available);
    };

    socket.once('connect', () => finish(false)); // Something is listening
    socket.once('error', (err) => {
      // ECONNREFUSED => nothing listening on that host
      // ETIMEDOUT/EHOSTUNREACH => treat as available for localhost checks
      finish(true);
    });
    socket.setTimeout(500, () => finish(true));
  });

  // Check both IPv4 and IPv6 localhost
  return Promise.all([
    tryConnect('127.0.0.1'),
    tryConnect('::1').catch(() => true), // ignore if IPv6 not available
  ]).then((results) => results.every(Boolean));
}

// Find available port starting from default
async function findAvailablePort(startPort) {
  let port = startPort;
  while (!(await isPortAvailable(port))) {
    port++;
  }
  return port;
}

async function setupEnvironment() {
  console.log('Setting up environment...');
  
  try {
    // Ensure data directory exists
    const dataDir = path.join(rootDir, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('  Created data directory');
    }
    // Fresh dev DB: remove legacy SQLite if present (unless KEEP_DB=1)
    const dbFile = path.join(dataDir, 'cc.db');
    const keepDb = process.env.KEEP_DB === '1' || process.env.CC_KEEP_DB === '1';
    if (fs.existsSync(dbFile) && !keepDb) {
      try {
        fs.unlinkSync(dbFile);
        console.log('  Removed existing SQLite database for a fresh dev setup');
      } catch (e) {
        console.warn('  Warning: could not delete existing database:', e.message);
      }
    }
    
    // Find available web port; API uses same port in Next.js fullstack
    const webPort = await findAvailablePort(DEFAULT_WEB_PORT);
    const apiPort = webPort;

    if (webPort !== DEFAULT_WEB_PORT) {
      console.log(`  Web port ${DEFAULT_WEB_PORT} is busy, using ${webPort}`);
    } else {
      console.log(`  Web port: ${webPort}`);
    }
    console.log(`  API port (Next.js fullstack): ${apiPort}`);
    
    // Create root .env file
    const envContent = `# Auto-generated environment configuration
API_PORT=${apiPort}
WEB_PORT=${webPort}
DATABASE_URL=sqlite:///${path.join(rootDir, 'data', 'cc.db')}
`;
    
    fs.writeFileSync(envFile, envContent);
    console.log(`  Created .env`);
    
    // Create or update apps/web/.env.local to match chosen API port
    const desiredApiBase = `http://localhost:${apiPort}`;
    const desiredWsBase = `ws://localhost:${apiPort}`;

    const writeEnvLocal = (content) => {
      fs.writeFileSync(webEnvFile, content);
    };

    if (!fs.existsSync(webEnvFile)) {
      const webEnvContent = `# Auto-generated environment configuration\nNEXT_PUBLIC_API_BASE=${desiredApiBase}\nNEXT_PUBLIC_WS_BASE=${desiredWsBase}\n`;
      writeEnvLocal(webEnvContent);
      console.log(`  Created apps/web/.env.local`);
    } else {
      let contents = fs.readFileSync(webEnvFile, 'utf8');
      const origContents = contents;

      const setOrAdd = (key, value) => {
        const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const lineRe = new RegExp(`^${safeKey}=.*$`, 'm');
        if (lineRe.test(contents)) {
          contents = contents.replace(lineRe, `${key}=${value}`);
        } else {
          if (!contents.endsWith('\n')) contents += '\n';
          contents += `${key}=${value}\n`;
        }
      };

      setOrAdd('NEXT_PUBLIC_API_BASE', desiredApiBase);
      setOrAdd('NEXT_PUBLIC_WS_BASE', desiredWsBase);

      // Deduplicate these keys, keeping the last occurrence
      const keysToDedup = ['NEXT_PUBLIC_API_BASE', 'NEXT_PUBLIC_WS_BASE'];
      const lines = contents.split(/\r?\n/);
      const seen = new Set();
      const result = [];
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        const kvMatch = line.match(/^([A-Z0-9_]+)=/);
        if (kvMatch && keysToDedup.includes(kvMatch[1])) {
          const key = kvMatch[1];
          if (seen.has(key)) continue; // skip older duplicates
          seen.add(key);
        }
        result.push(line);
      }
      contents = result.reverse().join('\n');

      if (contents !== origContents) {
        writeEnvLocal(contents);
        console.log('  Updated apps/web/.env.local to match API port');
      } else {
        console.log('  apps/web/.env.local already up to date');
      }
    }
    
    console.log('  Environment setup complete!');
    // Ensure Prisma Client and database schema (dev convenience)
    const webDir = path.join(rootDir, 'apps', 'web');
    try {
      const gen = spawnSync('npx', ['prisma', 'generate'], {
        cwd: webDir,
        stdio: 'pipe',
        encoding: 'utf-8'
      });
      if (gen.status === 0) {
        console.log('  Prisma client generated');
      } else {
        console.log('  prisma generate failed (non-critical):');
        console.log(gen.stdout || gen.stderr);
      }

      const push = spawnSync('npx', ['prisma', 'db', 'push'], {
        cwd: webDir,
        stdio: 'pipe',
        encoding: 'utf-8'
      });
      if (push.status === 0) {
        console.log('  Prisma schema pushed to SQLite database');
      } else {
        console.log('  prisma db push failed, forcing clean push (dev only)...');
        const reset = spawnSync('npx', ['prisma', 'db', 'push', '--force-reset', '--accept-data-loss'], {
          cwd: webDir,
          stdio: 'inherit'
        });
        if (reset.status === 0) {
          console.log('  Prisma schema force-reset applied');
        }
      }
    } catch (e) {
      console.log('  Warning: prisma setup failed or not available; continuing');
    }

    console.log('\n  Endpoints');
    console.log(`     Web + API: http://localhost:${webPort}`);
    
    // Return ports for use in other scripts
    return { apiPort, webPort };
  } catch (error) {
    console.error('\nFailed to setup environment');
    console.error('Error:', error.message);
    console.error('\nHow to fix:');
    console.error('   1. Check file permissions');
    console.error('   2. Ensure you have write access to the project directory');
    console.error('   3. Try running with elevated permissions if needed');
    process.exit(1);
  }
}

// If run directly
if (require.main === module) {
  setupEnvironment().catch(console.error);
}

module.exports = { setupEnvironment, findAvailablePort };
