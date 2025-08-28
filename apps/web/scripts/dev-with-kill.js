#!/usr/bin/env node

const { spawn } = require('child_process');
const { killPort } = require('./kill-port');

const port = process.env.PORT || 3000;

async function startDev() {
  // 1. 먼저 포트를 사용하는 프로세스 종료
  console.log(`🔍 Checking port ${port}...`);
  killPort(port);
  
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