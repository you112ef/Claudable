const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

function getPythonVersion(cmd) {
  try {
    const res = spawnSync(cmd, ['-c', 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'], { encoding: 'utf8', shell: false });
    if (res.status === 0 && res.stdout) {
      const [majStr, minStr] = String(res.stdout).trim().split('.')
      const major = parseInt(majStr, 10);
      const minor = parseInt(minStr, 10);
      if (Number.isInteger(major) && Number.isInteger(minor)) return { major, minor };
    }
  } catch (_) {}
  try {
    const res = spawnSync(cmd, ['--version'], { encoding: 'utf8', shell: false });
    if (res.status === 0 && res.stdout) {
      const m = res.stdout.match(/Python\s+(\d+)\.(\d+)/i);
      if (m) return { major: parseInt(m[1], 10), minor: parseInt(m[2], 10) };
    }
  } catch (_) {}
  return null;
}

function resolvePython() {
  // Prefer specific Python versions first (>=3.12 down to 3.10)
  const preferred = [
    '/opt/homebrew/bin/python3.12', '/usr/local/bin/python3.12', '/usr/bin/python3.12',
    '/opt/homebrew/bin/python3.11', '/usr/local/bin/python3.11', '/usr/bin/python3.11',
    '/opt/homebrew/bin/python3.10', '/usr/local/bin/python3.10', '/usr/bin/python3.10'
  ];
  const generic = [
    'python3', 'python', 'py -3',
    '/opt/homebrew/bin/python3', '/usr/local/bin/python3', '/usr/bin/python3', '/opt/local/bin/python3'
  ];

  const candidates = [...preferred, ...generic];
  let fallback = null;
  for (const cmd of candidates) {
    try {
      const res = spawnSync(cmd, ['--version'], { stdio: 'ignore', shell: false });
      if (res.status === 0) {
        const ver = getPythonVersion(cmd);
        if (ver && ver.major === 3 && ver.minor >= 10) return cmd;
        // keep best-effort fallback (any Python 3)
        if (ver && ver.major === 3 && !fallback) fallback = cmd;
      }
    } catch (_) {}
  }
  return fallback;
}

function splitCmd(cmd) {
  if (!cmd) return [cmd, []];
  // Simple split for commands like "py -3" on Windows.
  // Do not handle complex quoting – we only expect one optional flag.
  const parts = String(cmd).split(' ');
  const exe = parts.shift();
  return [exe, parts];
}

async function ensureVenvAndDeps({ pythonCmd, apiSrcDir, workDir, logFile }) {
  const isWindows = os.platform() === 'win32';
  const venvDir = path.join(workDir, '.venv');

  if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });
  if (logFile) {
    try { fs.writeFileSync(logFile, `# Claudable API setup log\n# ${new Date().toISOString()}\n`, { flag: 'w' }); } catch (_) {}
  }

  const pythonExec = isWindows ? path.join(venvDir, 'Scripts', 'python.exe') : path.join(venvDir, 'bin', 'python');
  let needCreate = !fs.existsSync(pythonExec);
  // Recreate venv if existing venv is < 3.10 but system has >= 3.10
  if (!needCreate) {
    const verVenv = getPythonVersion(pythonExec);
    const verSys = getPythonVersion(splitCmd(pythonCmd)[0]);
    if (verVenv && verVenv.major === 3 && verVenv.minor < 10 && verSys && verSys.minor >= 10) {
      try {
        if (logFile) fs.appendFileSync(logFile, `\n# Recreating venv with Python ${verSys.major}.${verSys.minor} (was ${verVenv.major}.${verVenv.minor})\n`);
        fs.rmSync(venvDir, { recursive: true, force: true });
        needCreate = true;
      } catch (_) {}
    }
  }
  if (needCreate) {
    const [exe, extra] = splitCmd(pythonCmd);
    await run(exe, [...extra, '-m', 'venv', venvDir], { logFile });
  }

  const pipArgs = ['-m', 'pip', 'install', '--upgrade', 'pip'];
  await run(pythonExec, pipArgs, { logFile });

  const reqFile = path.join(apiSrcDir, 'requirements.txt');
  if (!fs.existsSync(reqFile)) {
    throw new Error(`requirements.txt를 찾을 수 없습니다: ${reqFile}`);
  }
  // Create a filtered requirements file that skips private/absent packages
  let filtered = reqFile;
  try {
    const raw = fs.readFileSync(reqFile, 'utf8').split(/\r?\n/);
    const lines = raw.filter((line) => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return true;
      // Skip packages that are not on PyPI or optional in desktop bundle
      if (/^claude[-_]?code[-_]?sdk\b/i.test(t)) return false;
      return true;
    });
    const filteredPath = path.join(workDir, 'requirements.filtered.txt');
    fs.writeFileSync(filteredPath, lines.join('\n') + '\n');
    filtered = filteredPath;
    if (logFile) fs.appendFileSync(logFile, `\n# Using filtered requirements: ${filteredPath}\n`);
  } catch (_) {
    // If anything goes wrong, fall back to original requirements
  }
  await run(pythonExec, ['-m', 'pip', 'install', '-r', filtered], { logFile });

  return { pythonExec };
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const { logFile, cwd, env } = opts;
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false, cwd, env: { ...process.env, ...env } });

    if (logFile) {
      const logStream = fs.createWriteStream(logFile, { flags: 'a' });
      logStream.write(`\n$ ${cmd} ${args.join(' ')}\n`);
      child.stdout.on('data', (d) => logStream.write(d));
      child.stderr.on('data', (d) => logStream.write(d));
      child.on('close', () => logStream.end());
    }

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with ${code}`));
    });
  });
}

function startApi({ pythonExec, apiSrcDir, apiPort, logFile, extraEnv }) {
  const isWindows = os.platform() === 'win32';
  const args = ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(apiPort), '--log-level', 'warning'];
  const child = spawn(pythonExec, args, {
    cwd: apiSrcDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    env: { ...process.env, API_PORT: String(apiPort), ...(extraEnv || {}) }
  });
  if (logFile) {
    try {
      const stream = fs.createWriteStream(logFile, { flags: 'a' });
      stream.write(`\n# Starting API server on port ${apiPort}\n`);
      child.stdout.on('data', (d) => stream.write(d));
      child.stderr.on('data', (d) => stream.write(d));
      child.on('close', () => stream.end());
    } catch (_) {}
  }
  return child;
}

async function bootstrapApi({ apiSrcDir, apiPort, userDataDir }) {
  const pythonCmd = resolvePython();
  if (!pythonCmd) {
    throw new Error('Python 3가 필요합니다. https://www.python.org/downloads/ 에서 설치 후 다시 시도하세요.');
  }
  const workDir = path.join(userDataDir, 'cc-api');
  const logFile = path.join(workDir, 'install.log');
  try {
    const { pythonExec } = await ensureVenvAndDeps({ pythonCmd, apiSrcDir, workDir, logFile });
    const apiLog = path.join(workDir, 'api.log');
    // Ensure application data directory for DB
    const dataDir = path.join(workDir, 'data');
    try { fs.mkdirSync(dataDir, { recursive: true }); } catch (_) {}
    const dbPath = path.join(dataDir, 'cc.db');
    const databaseUrl = `sqlite:///${dbPath}`;
    const child = startApi({ pythonExec, apiSrcDir, apiPort, logFile: apiLog, extraEnv: { DATABASE_URL: databaseUrl } });
    return child;
  } catch (e) {
    const hint = `자세한 로그: ${logFile}`;
    const err = new Error(`Python 환경 설정 실패: ${e.message}\n${hint}`);
    err.logFile = logFile;
    throw err;
  }
}

module.exports = { bootstrapApi };
