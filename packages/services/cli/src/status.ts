import { spawn } from 'node:child_process'
import { platform } from 'node:os'

// Lightweight in-memory cache for CLI status checks
// Avoids repeatedly spawning binaries which can add 1–2s latency.
type Cached<T> = { value: T; ts: number }
const CACHE_TTL_MS = parseInt(process.env.CLI_STATUS_TTL_MS || '60000', 10) // default 60s
const cache = new Map<string, Cached<any>>()
const inflight = new Map<string, Promise<any>>()

function getCached<T>(key: string): T | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.ts > CACHE_TTL_MS) { cache.delete(key); return null }
  return hit.value as T
}

function setCached<T>(key: string, value: T) {
  cache.set(key, { value, ts: Date.now() })
}

function checkCmd(cmd: string, args: string[] = ['--version']): Promise<{ installed: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += String(d)))
    child.stderr.on('data', (d) => (err += String(d)))
    child.on('error', () => resolve({ installed: false, error: 'spawn error' }))
    child.on('close', (code) => resolve({ installed: code === 0, output: out.trim(), error: err.trim() }))
  })
}

async function checkVersion(cmd: string): Promise<{ installed: boolean; version?: string }> {
  // Try direct spawn first
  const direct = await checkCmd(cmd, ['--version']).catch(() => ({ installed: false }))
  if ((direct as any).installed) return { installed: true, version: (direct as any).output || undefined }
  // Fallback: run through login shell to inherit user PATH
  return new Promise((resolve) => {
    const isWin = platform() === 'win32'
    const shell = process.env.SHELL || (isWin ? 'cmd.exe' : 'bash')
    const cmdline = isWin ? `${cmd} --version` : `${cmd} --version`
    const child = spawn(shell, isWin ? ['/c', cmdline] : ['-lc', cmdline], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (d) => (out += String(d)))
    child.on('error', () => resolve({ installed: false }))
    child.on('close', (code) => resolve({ installed: code === 0, version: code === 0 ? out.trim() : undefined }))
  })
}

export async function getCliStatusSingle(cliType: string) {
  const key = `single:${cliType}`
  const memo = getCached<any>(key)
  if (memo) return memo
  const pending = inflight.get(key)
  if (pending) return pending
  const p = (async () => {
  switch (cliType) {
    case 'codex': {
      const v = await checkVersion('codex')
      return { cli_type: 'codex', available: v.installed, configured: v.installed, version: v.version, models: ['gpt-5', 'gpt-4o', 'gpt-4o-mini'] }
    }
    case 'cursor': {
      const v = await checkVersion('cursor-agent')
      return { cli_type: 'cursor', available: v.installed, configured: v.installed, version: v.version, models: ['gpt-5', 'sonnet-4'] }
    }
    case 'claude': {
      // Local OAuth creds handled by CLI; availability by --version
      const v = await checkVersion('claude')
      return { cli_type: 'claude', available: v.installed, configured: v.installed, version: v.version, models: ['claude-sonnet-4', 'claude-opus-4'] }
    }
    case 'qwen': {
      const v = await checkVersion('qwen')
      return { cli_type: 'qwen', available: v.installed, configured: v.installed, version: v.version, models: ['qwen-coder'] }
    }
    case 'gemini': {
      const v = await checkVersion('gemini')
      return { cli_type: 'gemini', available: v.installed, configured: v.installed, version: v.version, models: ['gemini-2.5-pro', 'gemini-2.5-flash'] }
    }
    default:
      return { cli_type: cliType, available: false, configured: false, models: [] }
  }
  })()
  inflight.set(key, p)
  try {
    const val = await p
    setCached(key, val)
    return val
  } finally {
    inflight.delete(key)
  }
}

export async function getAllCliStatus(preferred_cli: string) {
  const key = `all:${preferred_cli}`
  const memo = getCached<any>(key)
  if (memo) return memo
  const pending = inflight.get(key)
  if (pending) return pending
  const p = Promise.all([
    getCliStatusSingle('claude'),
    getCliStatusSingle('cursor'),
    getCliStatusSingle('codex'),
    getCliStatusSingle('qwen'),
    getCliStatusSingle('gemini'),
  ]).then(([claude, cursor, codex, qwen, gemini]) => ({ claude, cursor, codex, qwen, gemini, preferred_cli }))
  inflight.set(key, p)
  try {
    const val = await p
    setCached(key, val)
    return val
  } finally {
    inflight.delete(key)
  }
}

// Optional: allow explicit cache clear from admin scripts/tests
export function clearCliStatusCache() {
  cache.clear()
  inflight.clear()
}
