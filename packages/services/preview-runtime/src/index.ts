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
const startingRegistry = new Map<string, Promise<{ success: boolean; port?: number; url?: string; process_name?: string; process_id?: number; error?: string }>>()
const MAX_LOG_LINES = 2000

async function waitForDevServerReady(logs: string[], timeoutMs: number): Promise<void> {
  const startTime = Date.now()
  
  return new Promise((resolve, reject) => {
    const checkReady = () => {
      // Check if logs contain Next.js ready messages
      const logContent = logs.join('\n').toLowerCase()
      
      if (logContent.includes('ready in') || 
          logContent.includes('local:') || 
          logContent.includes('ready on') ||
          logContent.includes('compiled successfully')) {
        resolve()
        return
      }
      
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        resolve() // Don't reject, just proceed
        return
      }
      
      // Check again in 200ms
      setTimeout(checkReady, 200)
    }
    
    // Start checking after initial delay
    setTimeout(checkReady, 1000)
  })
}

function getProjectPort(projectId: string): number {
  const { start, end } = previewPorts()
  // Create deterministic port based on project ID
  const hash = crypto.createHash('md5').update(projectId).digest('hex')
  const hashNum = parseInt(hash.substring(0, 8), 16)
  const portRange = end - start + 1
  const port = start + (hashNum % portRange)
  return port
}

export async function findFreePort(projectId?: string): Promise<number> {
  const { start, end } = previewPorts()
  
  // If projectId provided, try to use its deterministic port first
  if (projectId) {
    const projectPort = getProjectPort(projectId)
    const ok = await isPortFree(projectPort)
    if (ok) {
      return projectPort
    } else {
    }
  }
  
  // Get all ports currently used by registry
  const usedPorts = new Set<number>()
  for (const [regProjectId, info] of registry.entries()) {
    usedPorts.add(info.port)
  }
  
  for (let p = start; p <= end; p++) {
    // Skip if port is already registered to another project
    if (usedPorts.has(p)) {
      continue
    }
    
    const ok = await isPortFree(p)
    if (ok) {
      return p
    } else {
    }
  }
  
  throw new Error('No free port available in preview range')
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    // First check with lsof for more reliable detection
    const { exec } = require('child_process')
    exec(`lsof -i :${port}`, (error, stdout) => {
      if (stdout && stdout.trim()) {
        resolve(false)
        return
      }
      
      // Fallback to socket test
      const server = net.createServer()
      server.unref()
      server.on('error', () => {
        resolve(false)
      })
      server.listen({ port, host: '127.0.0.1' }, () => {
        server.close(() => {
          resolve(true)
        })
      })
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

export async function startPreview(projectId: string, repoPath: string, port?: number): Promise<{ success: boolean; port?: number; url?: string; process_name?: string; process_id?: number; error?: string }> {
  // 🔒 Concurrency Control: Check if already starting
  const existingStart = startingRegistry.get(projectId)
  if (existingStart) {
    return existingStart
  }

  // 🔒 Create new start promise and register it
  const startPromise = startPreviewInternal(projectId, repoPath, port)
  startingRegistry.set(projectId, startPromise)
  
  // 🔒 Always clean up registry when done (success or failure)
  startPromise.finally(() => {
    startingRegistry.delete(projectId)
  })
  
  return startPromise
}

async function startPreviewInternal(projectId: string, repoPath: string, port?: number): Promise<{ success: boolean; port?: number; url?: string; process_name?: string; process_id?: number; error?: string }> {
  try {
    
    // Stop any existing preview for this project (with better cleanup)
    await stopPreview(projectId)
    
    if (!fs.existsSync(path.join(repoPath, 'package.json'))) {
      const error = `No package.json found in ${repoPath}`
      return { success: false, error }
    }
    
    const p = port || (await findFreePort(projectId))
    const processName = `next-dev-${projectId}`

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
        child.on('error', (error) => {
          reject(error)
        })
        child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err || 'npm install failed'))))
      })
      await saveInstallHash(repoPath)
    } else {
    }

    const child = spawn('npm', ['run', 'dev', '--', '-p', String(p)], { 
      cwd: repoPath, 
      env,
      detached: true  // Create new process group for proper cleanup
    })
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
    
    // Wait for Next.js dev server to be ready (check for "Ready" message in logs)
    await waitForDevServerReady(logs, 15000)
    
    if (child.exitCode !== null) {
      registry.delete(projectId)
      const error = `Next.js server failed to start (exit code: ${child.exitCode})`
      try { wsRegistry.broadcast(projectId, { type: 'preview_error', project_id: projectId, message: error } as any) } catch {}
      return { success: false, error }
    }
    
    try { wsRegistry.broadcast(projectId, { type: 'preview_success', project_id: projectId, url, port: p } as any) } catch {}
    
    return {
      success: true,
      port: p,
      url,
      process_name: processName,
      process_id: child.pid ?? undefined
    }
  } catch (e: any) {
    const error = e?.message || 'Failed to start preview'
    try { wsRegistry.broadcast(projectId, { type: 'preview_error', project_id: projectId, message: error } as any) } catch {}
    return { success: false, error }
  }
}

export async function stopPreview(projectId: string): Promise<void> {
  const info = registry.get(projectId)
  if (!info) {
    return
  }
  
  
  try {
    // Terminate the entire process group (FastAPI style)
    if (info.child.pid) {
      try {
        // Kill the entire process group
        process.kill(-info.child.pid, 'SIGTERM')
      } catch (killError) {
        info.child.kill('SIGTERM')
      }
    }
    
    // Wait for graceful shutdown (increased to 5 seconds like FastAPI)
    await new Promise((resolve) => setTimeout(resolve, 5000))
    
    // Force kill if still running
    if (info.child.exitCode === null) {
      try {
        if (info.child.pid) {
          process.kill(-info.child.pid, 'SIGKILL')
        } else {
          info.child.kill('SIGKILL')
        }
      } catch (forceKillError) {
        info.child.kill('SIGKILL')
      }
    }
    
  } catch (error) {
  } finally {
    // Always remove from registry
    registry.delete(projectId)
  }
  
  try { 
    wsRegistry.broadcast(projectId, { 
      type: 'project_status', 
      data: { status: 'preview_stopped', message: 'Preview stopped' } 
    } as any) 
  } catch {}
}

export async function ensureDependenciesBackground(projectId: string, repoPath: string): Promise<void> {
  try {
    if (!(await shouldInstallDeps(repoPath))) return
    try { wsRegistry.broadcast(projectId, { type: 'project_status', data: { status: 'installing_dependencies', message: 'Installing dependencies...' } } as any) } catch {}
    await new Promise<void>((resolve, reject) => {
      const env = { ...process.env }
      const child = spawn('npm', ['install'], { cwd: repoPath, env })
      let err = ''
      child.stderr?.on('data', (d) => (err += String(d)))
      child.on('error', reject)
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err || 'npm install failed'))))
    })
    await saveInstallHash(repoPath)
    try { wsRegistry.broadcast(projectId, { type: 'project_status', data: { status: 'dependencies_installed', message: 'Dependencies installed' } } as any) } catch {}
  } catch (e: any) {
    try { wsRegistry.broadcast(projectId, { type: 'preview_error', project_id: projectId, message: e?.message || 'Dependency install failed' } as any) } catch {}
  }
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

// Clean up zombie processes in preview port range
async function cleanupZombieProcesses(): Promise<void> {
  const { start, end } = previewPorts()
  const { exec } = require('child_process')
  
  return new Promise((resolve) => {
    // Find all processes using preview ports
    exec(`lsof -i :${start}-${end} -t`, (error, stdout) => {
      if (!stdout || !stdout.trim()) {
        resolve()
        return
      }
      
      const pids = stdout.trim().split('\n')
      
      // Kill each process
      const killPromises = pids.map(pid => {
        return new Promise<void>((killResolve) => {
          exec(`kill -9 ${pid}`, (killError) => {
            if (killError) {
            } else {
            }
            killResolve()
          })
        })
      })
      
      Promise.all(killPromises).then(() => {
        resolve()
      })
    })
  })
}

// Debug function to show registry status
export function getRegistryStatus(): { projectId: string; port: number; pid: number | undefined; running: boolean; startedAt: number }[] {
  const status = []
  for (const [projectId, info] of registry.entries()) {
    status.push({
      projectId,
      port: info.port,
      pid: info.child.pid,
      running: info.child.exitCode === null,
      startedAt: info.startedAt
    })
  }
  return status
}
