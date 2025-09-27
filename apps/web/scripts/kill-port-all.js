#!/usr/bin/env node

// 여러 포트를 한 번에 종료하는 유틸리티 스크립트
const { execSync } = require('child_process');

const ports = process.argv.slice(2).map(p => parseInt(p)).filter(Boolean);
if (ports.length === 0) {
  ports.push(3000); // 기본값
}

console.log(`🧹 Cleaning up ports: ${ports.join(', ')}`);

for (const port of ports) {
  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      try {
        const result = execSync(`lsof -ti:${port}`, { encoding: 'utf8' }).trim();
        if (result) {
          const pids = result.split('\n').filter(Boolean);
          console.log(`  📍 Port ${port}: killing PIDs ${pids.join(', ')}`);
          execSync(`kill -9 ${pids.join(' ')}`);
        } else {
          console.log(`  ✅ Port ${port}: already free`);
        }
      } catch (e) {
        console.log(`  ✅ Port ${port}: already free`);
      }
    }
  } catch (error) {
    console.error(`  ⚠️ Port ${port}: ${error.message}`);
  }
}

console.log('🎉 All ports cleaned!');