#!/usr/bin/env node

const { spawn } = require('child_process');
const { killPort } = require('./kill-port');
const path = require('path');
const { spawnSync } = require('child_process');

const port = process.env.PORT || 3000;

async function startDev() {
  // 1. 먼저 포트를 사용하는 프로세스 종료
  console.log(`🔍 Checking port ${port}...`);
  killPort(port);
  
  // 1.5. Ensure env + prisma before starting server (just-works DX)
  try {
    // apps/web/scripts → project root
    const rootDir = path.join(__dirname, '..', '..', '..');
    // Run root env setup
    console.log('🧩 Ensuring environment...');
    spawnSync('node', [path.join(rootDir, 'scripts', 'setup-env.js')], { stdio: 'inherit' });
    // Generate Prisma client
    console.log('🧬 Generating Prisma client...');
    const gen = spawnSync('npx', ['prisma', 'generate'], { cwd: path.join(rootDir, 'apps', 'web'), stdio: 'inherit' });
    if (gen.status !== 0) console.warn('⚠️  prisma generate failed, continuing...');
    // Force fresh schema (setup-env already removed old DB)
    console.log('🗃️  Applying database schema...');
    const webDir = path.join(rootDir, 'apps', 'web');
    const push = spawnSync('npx', ['prisma', 'db', 'push'], { cwd: webDir, stdio: 'inherit' });
    if (push.status !== 0) {
      console.warn('⚠️  prisma db push failed, forcing reset (dev only)...');
      spawnSync('npx', ['prisma', 'db', 'push', '--force-reset', '--accept-data-loss'], { cwd: webDir, stdio: 'inherit' });
    }
  } catch (e) {
    console.warn('⚠️  Env/Prisma bootstrap skipped:', e.message);
  }

  // 2. 서버 시작
  console.log(`🚀 Starting Next.js server on port ${port}...`);
  console.log('━'.repeat(50));
  
  const server = spawn('node', ['server.js'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: port }
  });

  // 프로세스 종료 처리
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down server...');
    server.kill('SIGINT');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    server.kill('SIGTERM');
    process.exit(0);
  });

  server.on('error', (error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });

  server.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`❌ Server exited with code ${code}`);
      process.exit(code);
    }
  });
}

startDev();
