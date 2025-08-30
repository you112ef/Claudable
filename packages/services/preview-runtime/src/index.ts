import net from 'node:net'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { previewPorts } from '@repo/config'
import { wsRegistry } from '@repo/ws'

type ProcInfo = {
  child: import('node:child_process').ChildProcessWithoutNullStreams
  port: number
  url: string
  logs: string[]
  startedAt: number
}

const registry = new Map<string, ProcInfo>()
const MAX_LOG_LINES = 2000

export async function findFreePort(): Promise<number> {
  const { start, end } = previewPorts()
  for (let p = start; p <= end; p++) {
    const ok = await isPortFree(p)
    if (ok) return p
  }
  throw new Error('No free port available in preview range')
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.on('error', () => resolve(false))
    server.listen({ port, host: '127.0.0.1' }, () => {
      server.close(() => resolve(true))
    })
  })
}

function packageHash(repoPath: string): string {
  let buf = ''
  const pj = path.join(repoPath, 'package.json')
  const pl = path.join(repoPath, 'package-lock.json')
  if (fs.existsSync(pj)) buf += crypto.createHash('md5').update(fs.readFileSync(pj)).digest('hex')
  if (fs.existsSync(pl)) buf += crypto.createHash('md5').update(fs.readFileSync(pl)).digest('hex')
  return crypto.createHash('md5').update(buf).digest('hex')
}

function installHashPath(repoPath: string) { return path.join(repoPath, '.lovable_install_hash') }

async function shouldInstallDeps(repoPath: string): Promise<boolean> {
  const current = packageHash(repoPath)
  try {
    const stored = (await fsp.readFile(installHashPath(repoPath), 'utf8')).trim()
    return stored !== current
  } catch {
    return true
  }
}

async function saveInstallHash(repoPath: string) {
  const h = packageHash(repoPath)
  await fsp.writeFile(installHashPath(repoPath), h)
}

export async function startPreview(projectId: string, repoPath: string, port?: number): Promise<{ running: boolean; port?: number; url?: string; process_id?: number; error?: string | null }> {
  try {
    await stopPreview(projectId)
    if (!fs.existsSync(path.join(repoPath, 'package.json'))) {
      return { running: false, error: `No package.json found in ${repoPath}` }
    }
    const p = port || (await findFreePort())

    const env = {
      ...process.env,
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1',
      NPM_CONFIG_UPDATE_NOTIFIER: 'false',
      PORT: String(p),
      BROWSER: 'none',
    }

    if (await shouldInstallDeps(repoPath)) {
      await new Promise<void>((resolve, reject) => {
        const child = spawn('npm', ['install'], { cwd: repoPath, env })
        let err = ''
        child.stderr?.on('data', (d) => (err += String(d)))
        child.on('error', reject)
        child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err || 'npm install failed'))))
      })
      await saveInstallHash(repoPath)
    }

    const child = spawn('npm', ['run', 'dev', '--', '-p', String(p)], { cwd: repoPath, env })
    const logs: string[] = []
    child.stdout.on('data', (d) => {
      const s = String(d)
      for (const line of s.split(/\r?\n/)) {
        if (!line) continue
        logs.push(line)
        if (logs.length > MAX_LOG_LINES) logs.shift()
      }
    })
    child.stderr.on('data', (d) => {
      const s = String(d)
      for (const line of s.split(/\r?\n/)) {
        if (!line) continue
        logs.push(line)
        if (logs.length > MAX_LOG_LINES) logs.shift()
      }
    })
    child.on('close', () => {
      registry.delete(projectId)
    })

    const url = `http://localhost:${p}`
    registry.set(projectId, { child, port: p, url, logs, startedAt: Date.now() })
    // small delay to ensure process started
    await new Promise((r) => setTimeout(r, 500))
    if (child.exitCode !== null) {
      registry.delete(projectId)
      const errMsg = 'Next.js server failed to start'
      try { wsRegistry.broadcast(projectId, { type: 'preview_error', project_id: projectId, message: errMsg } as any) } catch {}
      return { running: false, error: errMsg }
    }
    try { wsRegistry.broadcast(projectId, { type: 'preview_success', project_id: projectId, url, port: p } as any) } catch {}
    return { running: true, port: p, url, process_id: child.pid ?? undefined }
  } catch (e: any) {
    const msg = e?.message || 'Failed to start preview'
    try { wsRegistry.broadcast(projectId, { type: 'preview_error', project_id: projectId, message: msg } as any) } catch {}
    return { running: false, error: msg }
  }
}

export async function stopPreview(projectId: string): Promise<void> {
  const info = registry.get(projectId)
  if (!info) return
  try {
    // terminate child
    info.child.kill('SIGTERM')
    // give it a moment, then force
    await new Promise((r) => setTimeout(r, 500))
    if (info.child.exitCode === null) info.child.kill('SIGKILL')
  } catch {}
  registry.delete(projectId)
  try { wsRegistry.broadcast(projectId, { type: 'project_status', data: { status: 'preview_stopped', message: 'Preview stopped' } } as any) } catch {}
}

export function getStatus(projectId: string): { running: boolean; port: number | null; url: string | null; process_id: number | null; error: string | null } {
  const info = registry.get(projectId)
  if (!info) return { running: false, port: null, url: null, process_id: null, error: null }
  const child = info.child
  if (child.exitCode === null) {
    return { running: true, port: info.port, url: info.url, process_id: child.pid ?? null, error: null }
  }
  registry.delete(projectId)
  return { running: false, port: null, url: null, process_id: null, error: null }
}

export function getLogs(projectId: string, lines = 100): { logs: string; running: boolean } {
  const info = registry.get(projectId)
  if (!info) return { logs: 'No logs available - process not running', running: false }
  const slice = info.logs.slice(Math.max(0, info.logs.length - lines))
  return { logs: slice.join('\n'), running: info.child.exitCode === null }
}

export async function restartPreview(projectId: string, repoPath: string, port?: number) {
  await stopPreview(projectId)
  return startPreview(projectId, repoPath, port)
}

export function getAllErrorLogs(projectId: string): string {
  const info = registry.get(projectId)
  if (!info) return 'No logs available for this project'
  // simple: return all logs for now; advanced filtering can be added later
  if (info.logs.length === 0) return 'No logs available for this project'
  return info.logs.join('\n')
}
