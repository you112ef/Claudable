#!/usr/bin/env node

const { execSync } = require('child_process');
const port = process.env.PORT || 3000;

function killPort(port) {
  try {
    // macOS/Linux에서 포트를 사용하는 프로세스 찾아서 종료
    if (process.platform === 'darwin' || process.platform === 'linux') {
      // lsof 명령어로 포트를 사용하는 프로세스 찾기
      try {
        const result = execSync(`lsof -ti:${port}`, { encoding: 'utf8' }).trim();
        if (result) {
          console.log(`📍 Port ${port} is in use by PID ${result}`);
          console.log(`🔪 Killing process...`);
          execSync(`kill -9 ${result}`);
          console.log(`✅ Port ${port} is now free`);
          // 프로세스가 완전히 종료될 때까지 잠시 대기
          execSync('sleep 1');
        }
      } catch (e) {
        // lsof가 아무것도 찾지 못하면 에러가 발생하지만 이는 정상
        console.log(`✅ Port ${port} is already free`);
      }
    } else if (process.platform === 'win32') {
      // Windows에서 포트를 사용하는 프로세스 찾아서 종료
      try {
        const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
        const lines = result.split('\n').filter(line => line.includes('LISTENING'));
        if (lines.length > 0) {
          const pid = lines[0].trim().split(/\s+/).pop();
          console.log(`📍 Port ${port} is in use by PID ${pid}`);
          console.log(`🔪 Killing process...`);
          execSync(`taskkill /PID ${pid} /F`);
          console.log(`✅ Port ${port} is now free`);
        }
      } catch (e) {
        console.log(`✅ Port ${port} is already free`);
      }
    }
  } catch (error) {
    console.error(`⚠️ Error checking/killing port ${port}:`, error.message);
  }
}

// 스크립트가 직접 실행될 때만 실행
if (require.main === module) {
  killPort(port);
}

module.exports = { killPort };