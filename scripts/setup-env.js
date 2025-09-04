#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const net = require('net');

const rootDir = path.join(__dirname, '..');
const envFile = path.join(rootDir, '.env');
const webEnvFile = path.join(rootDir, 'apps', 'web', '.env.local');

// Default port
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
    
    // Find available port for Next.js
    const webPort = await findAvailablePort(DEFAULT_WEB_PORT);
    
    if (webPort !== DEFAULT_WEB_PORT) {
      console.log(`  Port ${DEFAULT_WEB_PORT} is busy, using ${webPort}`);
    } else {
      console.log(`  Using port: ${webPort}`);
    }
    
    // Create root .env file
    const envContent = `# Auto-generated environment configuration
WEB_PORT=${webPort}
DATABASE_URL=sqlite:///${path.join(rootDir, 'data', 'cc.db')}
`;
    
    fs.writeFileSync(envFile, envContent);
    console.log(`  Created .env`);
    
    // Create or update apps/web/.env.local 
    // Note: We'll use relative URLs to work with any port
    // Next.js will automatically use the current host/port
    const writeEnvLocal = (content) => {
      fs.writeFileSync(webEnvFile, content);
    };

    if (!fs.existsSync(webEnvFile)) {
      // Using empty values means the app will use relative URLs (same origin)
      const webEnvContent = `# Auto-generated environment configuration
# Leave empty to use relative URLs (works with any port)
NEXT_PUBLIC_API_BASE=
NEXT_PUBLIC_WS_BASE=
`;
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

      // Set to empty to use relative URLs
      setOrAdd('NEXT_PUBLIC_API_BASE', '');
      setOrAdd('NEXT_PUBLIC_WS_BASE', '');

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
        console.log('  Updated apps/web/.env.local to match Web port');
      } else {
        console.log('  apps/web/.env.local already up to date');
      }
    }
    
    console.log('  Environment setup complete!');
    
    if (webPort !== DEFAULT_WEB_PORT) {
      console.log('\n  Note: Using non-default port');
      console.log(`     Web: http://localhost:${webPort}`);
    }
    
    // Return port for use in other scripts
    return { webPort };
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
