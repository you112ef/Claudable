import { getPrisma } from '@repo/db'
import { wsRegistry } from '@repo/ws'

type VercelProject = { id: string; name: string; url: string }
type VercelDeployment = { id: string; url: string; state: string; createdAt: number }

const monitoring = new Map<string, { timer: NodeJS.Timeout; startedAt: number; deploymentId: string }>()

async function getToken(): Promise<string | null> {
  const prisma = await getPrisma()
  const row = await (prisma as any).serviceToken.findFirst({ where: { provider: 'vercel' }, orderBy: { updatedAt: 'desc' } })
  return row?.token || null
}

async function vFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getToken()
  if (!token) throw new Error('Vercel token not configured')
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('Accept', 'application/json')
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  return fetch(`https://api.vercel.com${path}`, { ...init, headers })
}

export async function checkProjectAvailable(projectName: string): Promise<{ available: boolean }> {
  try {
    // Best-effort: if querying a specific project returns 404, consider available
    const res = await vFetch(`/v9/projects/${encodeURIComponent(projectName)}`)
    if (res.status === 404) return { available: true }
    if (res.ok) return { available: false }
    return { available: false }
  } catch {
    // If token missing or API error, report unavailable
    return { available: false }
  }
}

export async function connectVercelProject(projectId: string, name: string): Promise<{ success: boolean; project?: VercelProject; message: string }> {
  const prisma = await getPrisma()
  try {
    // Create minimal project (best-effort)
    const res = await vFetch('/v10/projects', { method: 'POST', body: JSON.stringify({ name }) })
    if (!res.ok) throw new Error(`Vercel create failed: ${res.status}`)
    const data = await res.json()
    const proj: VercelProject = { id: data.id, name: data.name, url: data.link?.url || `https://${data.name}.vercel.app` }
    const existing = await (prisma as any).projectServiceConnection.findFirst({ where: { projectId, provider: 'vercel' } })
    if (existing) {
      await (prisma as any).projectServiceConnection.update({ where: { id: existing.id }, data: { status: 'connected', serviceData: JSON.stringify(proj), updatedAt: new Date() } })
    } else {
      await (prisma as any).projectServiceConnection.create({ data: { id: (globalThis as any).crypto?.randomUUID?.() || require('node:crypto').randomUUID(), projectId, provider: 'vercel', status: 'connected', serviceData: JSON.stringify(proj), createdAt: new Date() } })
    }
    return { success: true, project: proj, message: 'Vercel connected' }
  } catch (e: any) {
    return { success: false, message: e?.message || 'Failed to connect Vercel' }
  }
}

export async function createDeployment(projectId: string, branch?: string): Promise<{ success: boolean; deployment?: VercelDeployment; message: string }> {
  try {
    const prisma = await getPrisma();
    
    // Get GitHub connection data for branch resolution
    const githubConn = await (prisma as any).projectServiceConnection.findFirst({ 
      where: { projectId, provider: 'github' } 
    });
    
    const githubData = githubConn?.serviceData ? JSON.parse(githubConn.serviceData) : {};
    const preferredBranch = branch || 
      githubData.last_pushed_branch ||
      githubData.default_branch ||
      'main';

    console.log(`Creating Vercel deployment for project ${projectId} using branch: ${preferredBranch}`);

    // Build deployment payload with git source
    const deploymentPayload = {
      gitSource: {
        type: 'github',
        ref: preferredBranch
      }
    };

    const res = await vFetch('/v13/deployments', { 
      method: 'POST', 
      body: JSON.stringify(deploymentPayload) 
    });
    
    if (!res.ok) throw new Error(`Vercel deployment failed: ${res.status}`)
    const data = await res.json()
    const dep: VercelDeployment = { 
      id: data.id, 
      url: data.url, 
      state: data.state || 'CREATED', 
      createdAt: data.createdAt || Date.now() 
    }
    // Start monitoring this deployment
    startMonitoring(projectId, dep.id).catch(() => {})
    return { success: true, deployment: dep, message: `Deployment created from branch: ${preferredBranch}` }
  } catch (e: any) {
    return { success: false, message: e?.message || 'Failed to deploy' }
  }
}

export async function getConnectionStatus(projectId: string) {
  const prisma = await getPrisma()
  const conn = await (prisma as any).projectServiceConnection.findFirst({ where: { projectId, provider: 'vercel' } })
  const tokenExists = !!(await getToken())
  const serviceData = conn?.serviceData ? JSON.parse(conn.serviceData) : {}
  const projectConnected = !!conn
  return { connected: !!conn, status: conn?.status || 'not_connected', service_data: serviceData, created_at: conn?.createdAt || null, updated_at: conn?.updatedAt || null, token_exists: tokenExists, project_connected: projectConnected }
}

export async function disconnectVercel(projectId: string) {
  const prisma = await getPrisma()
  const conn = await (prisma as any).projectServiceConnection.findFirst({ where: { projectId, provider: 'vercel' } })
  if (conn) await (prisma as any).projectServiceConnection.delete({ where: { id: conn.id } })
  const m = monitoring.get(projectId)
  if (m) { clearInterval(m.timer); monitoring.delete(projectId) }
}

export async function getCurrentDeploymentStatus(projectId: string) {
  const prisma = await getPrisma()
  const conn = await (prisma as any).projectServiceConnection.findFirst({ where: { projectId, provider: 'vercel' } })
  if (!conn) return { has_deployment: false }
  try {
    const data = conn.serviceData ? JSON.parse(conn.serviceData) : {}
    const current = data.current_deployment
    if (!current) {
      return { has_deployment: false, last_deployment_url: data.deployment_url || null, last_deployment_at: data.last_deployment_at || null }
    }
    return { has_deployment: true, deployment_id: current.deployment_id, status: current.status, deployment_url: current.deployment_url || null, last_checked_at: current.last_checked_at || null }
  } catch {
    return { has_deployment: false }
  }
}

export function stopMonitoring(projectId: string) {
  const m = monitoring.get(projectId)
  if (m) { clearInterval(m.timer); monitoring.delete(projectId) }
  return { message: 'Stopped monitoring' }
}

export function listActiveMonitoring() {
  return { active_projects: Array.from(monitoring.keys()) }
}

// --- Monitoring helpers ---
async function getDeploymentStatus(deploymentId: string): Promise<{ id: string; status: string; url: string | null; raw_response?: any; ready?: boolean; readyState?: string }> {
  const res = await vFetch(`/v13/deployments/${deploymentId}`)
  if (!res.ok) throw new Error(`status ${res.status}`)
  const data = await res.json()
  // Normalize
  const status = data?.readyState || data?.state || data?.status || 'UNKNOWN'
  const url = data?.aliasFinal || (Array.isArray(data?.alias) ? data.alias[0] : data?.url) || null
  return { id: deploymentId, status: String(status).toUpperCase(), url, raw_response: data, ready: data?.ready === true, readyState: data?.readyState }
}

async function updateDeploymentStatusInDb(projectId: string, statusData: { id: string; status: string; url: string | null }) {
  const prisma = await getPrisma()
  const conn = await (prisma as any).projectServiceConnection.findFirst({ where: { projectId, provider: 'vercel' } })
  if (!conn) return
  const serviceData = conn.serviceData ? (() => { try { return JSON.parse(conn.serviceData) } catch { return {} } })() : {}
  serviceData.current_deployment = {
    deployment_id: statusData.id,
    status: statusData.status,
    deployment_url: statusData.url,
    last_checked_at: new Date().toISOString(),
  }
  if (statusData.status === 'READY') {
    serviceData.deployment_url = statusData.url && String(statusData.url).startsWith('http') ? statusData.url : (statusData.url ? `https://${statusData.url}` : null)
    serviceData.last_deployment_at = new Date().toISOString()
    serviceData.current_deployment = null
  }
  if (statusData.status === 'ERROR') {
    serviceData.current_deployment = null
  }
  await (prisma as any).projectServiceConnection.update({ where: { id: conn.id }, data: { serviceData: JSON.stringify(serviceData), updatedAt: new Date() } })
}

async function startMonitoring(projectId: string, deploymentId: string) {
  // Clear any existing
  const prev = monitoring.get(projectId)
  if (prev) { clearInterval(prev.timer); monitoring.delete(projectId) }
  const startedAt = Date.now()
  const timer = setInterval(async () => {
    try {
      // Timeout 15 minutes
      if (Date.now() - startedAt > 15 * 60 * 1000) {
        clearInterval(timer); monitoring.delete(projectId); return
      }
      const s = await getDeploymentStatus(deploymentId)
      await updateDeploymentStatusInDb(projectId, s)
      if (s.status === 'READY' || s.status === 'ERROR') {
        try {
          wsRegistry.broadcast(projectId, { type: s.status === 'READY' ? 'project_status' : 'project_status', data: { status: s.status === 'READY' ? 'vercel_ready' : 'vercel_error', message: s.url || s.status } } as any)
        } catch {}
        clearInterval(timer); monitoring.delete(projectId)
      }
    } catch (e) {
      // backoff a bit on error
    }
  }, 3000)
  monitoring.set(projectId, { timer, startedAt, deploymentId })
}
