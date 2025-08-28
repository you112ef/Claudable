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

// Check if port is available
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
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
    
    // Create or normalize web .env.local for Next.js fullstack
    const desiredWebEnv = `# Auto-generated environment configuration
# Using relative URLs for Next.js API routes
NEXT_PUBLIC_API_BASE=
NEXT_PUBLIC_WS_BASE=
`;

    if (!fs.existsSync(webEnvFile)) {
      fs.writeFileSync(webEnvFile, desiredWebEnv);
      console.log(`  Created apps/web/.env.local`);
    } else {
      try {
        const current = fs.readFileSync(webEnvFile, 'utf8');
        // If it still points to :8080 or has non-empty endpoints, normalize to same-origin
        const hasExternal = /NEXT_PUBLIC_API_BASE\s*=\s*http/i.test(current) || /NEXT_PUBLIC_WS_BASE\s*=\s*ws/i.test(current);
        const has8080 = /8080/.test(current);
        if (hasExternal || has8080) {
          fs.writeFileSync(webEnvFile, desiredWebEnv);
          console.log('  Normalized apps/web/.env.local for Next.js same-origin API');
        } else {
          console.log('  apps/web/.env.local present; keeping existing values');
        }
      } catch (e) {
        console.warn('  Warning: could not read apps/web/.env.local, leaving as-is');
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
