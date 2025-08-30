import { getPrisma } from '@repo/db'

type VercelProject = { id: string; name: string; url: string }
type VercelDeployment = { id: string; url: string; state: string; createdAt: number }

const monitoring = new Set<string>()

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

export async function createDeployment(projectId: string): Promise<{ success: boolean; deployment?: VercelDeployment; message: string }> {
  try {
    const res = await vFetch('/v13/deployments', { method: 'POST', body: JSON.stringify({}) })
    if (!res.ok) throw new Error(`Vercel deployment failed: ${res.status}`)
    const data = await res.json()
    const dep: VercelDeployment = { id: data.id, url: data.url, state: data.state || 'CREATED', createdAt: data.createdAt || Date.now() }
    monitoring.add(projectId)
    return { success: true, deployment: dep, message: 'Deployment created' }
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
  monitoring.delete(projectId)
}

export async function getCurrentDeploymentStatus(projectId: string) {
  // Placeholder: return none; a real implementation would query last deployment id from service_data and fetch status
  return { has_deployment: false }
}

export function stopMonitoring(projectId: string) {
  monitoring.delete(projectId)
  return { message: 'Stopped monitoring' }
}

export function listActiveMonitoring() {
  return { active_projects: Array.from(monitoring) }
}

