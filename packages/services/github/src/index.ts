import { getPrisma } from '@repo/db'
import { hasChanges, commitAll } from '@repo/services-git'

type GHRepo = {
  id: number
  name: string
  full_name: string
  html_url: string
  clone_url?: string
  ssh_url?: string
  default_branch?: string
  private?: boolean
}

async function getToken(): Promise<string | null> {
  const prisma = await getPrisma()
  const row = await (prisma as any).serviceToken.findFirst({ where: { provider: 'github' }, orderBy: { updatedAt: 'desc' } })
  return row?.token || null
}

async function ghFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getToken()
  if (!token) throw new Error('GitHub token not configured')
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `token ${token}`)
  headers.set('Accept', 'application/vnd.github+json')
  return fetch(`https://api.github.com${path}`, { ...init, headers })
}

export async function getAuthedUser(): Promise<{ login: string }> {
  const res = await ghFetch('/user')
  if (!res.ok) throw new Error(`GitHub auth failed: ${res.status}`)
  return res.json()
}

export async function isRepoAvailable(repoName: string): Promise<{ available: boolean; username?: string; reason?: string }> {
  const user = await getAuthedUser()
  const res = await ghFetch(`/repos/${user.login}/${repoName}`)
  if (res.status === 404) return { available: true, username: user.login }
  if (res.ok) return { available: false, username: user.login, reason: 'Repository already exists' }
  return { available: false, username: user.login, reason: `GitHub error: ${res.status}` }
}

export async function createRepo(repoName: string, description?: string, isPrivate: boolean = true): Promise<GHRepo> {
  const res = await ghFetch('/user/repos', {
    method: 'POST',
    body: JSON.stringify({ name: repoName, description: description || '', private: isPrivate }),
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Create repo failed: ${res.status}`)
  const data = await res.json()
  return {
    id: data.id,
    name: data.name,
    full_name: data.full_name,
    html_url: data.html_url,
    clone_url: data.clone_url,
    ssh_url: data.ssh_url,
    default_branch: data.default_branch,
    private: data.private,
  }
}

export async function getRepoDetails(owner: string, repo: string): Promise<GHRepo> {
  const res = await ghFetch(`/repos/${owner}/${repo}`)
  if (!res.ok) throw new Error(`Get repo failed: ${res.status}`)
  const data = await res.json()
  return {
    id: data.id,
    name: data.name,
    full_name: data.full_name,
    html_url: data.html_url,
    clone_url: data.clone_url,
    ssh_url: data.ssh_url,
    default_branch: data.default_branch,
    private: data.private,
  }
}

export async function upsertGithubConnection(projectId: string, data: any) {
  const prisma = await getPrisma()
  const id = (globalThis as any).crypto?.randomUUID?.() || require('node:crypto').randomUUID()
  const existing = await (prisma as any).projectServiceConnection.findFirst({ where: { projectId, provider: 'github' } })
  if (existing) {
    await (prisma as any).projectServiceConnection.update({ where: { id: existing.id }, data: { status: 'connected', serviceData: JSON.stringify(data), updatedAt: new Date() } })
    return existing.id
  }
  const row = await (prisma as any).projectServiceConnection.create({ data: { id, projectId, provider: 'github', status: 'connected', serviceData: JSON.stringify(data), createdAt: new Date() } })
  return row.id
}

export async function getGithubConnection(projectId: string) {
  const prisma = await getPrisma()
  return (prisma as any).projectServiceConnection.findFirst({ where: { projectId, provider: 'github' } })
}

export async function removeGithubConnection(projectId: string) {
  const prisma = await getPrisma()
  const row = await (prisma as any).projectServiceConnection.findFirst({ where: { projectId, provider: 'github' } })
  if (row) await (prisma as any).projectServiceConnection.delete({ where: { id: row.id } })
}

export async function pushToGithub(projectId: string, projectRepoPath: string, branch?: string): Promise<{ success: boolean; message: string; error?: string; branch?: string }> {
  try {
    // Get GitHub connection to determine default branch
    const connection = await getGithubConnection(projectId);
    const serviceData = connection?.serviceData ? JSON.parse(connection.serviceData) : {};
    const defaultBranch = branch || serviceData.default_branch || serviceData.last_pushed_branch || 'main';
    
    // If there are staged/unstaged files but no commit, create one
    if (await hasChanges(projectRepoPath)) {
      await commitAll(projectRepoPath, 'chore: sync before push')
    }
    // Simple push; assumes remote origin set and auth configured globally
    const { spawn } = await import('node:child_process')
    const res = await new Promise<{ code: number; out: string; err: string }>((resolve) => {
      const child = spawn('git', ['push', '-u', 'origin', defaultBranch], { cwd: projectRepoPath, stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      let err = ''
      child.stdout.on('data', (d) => (out += String(d)))
      child.stderr.on('data', (d) => (err += String(d)))
      child.on('close', (code) => resolve({ code: code ?? 0, out, err }))
      child.on('error', () => resolve({ code: 1, out: '', err: 'spawn error' }))
    })
    
    // After successful push, update service data
    if (res.code === 0 && connection) {
      try {
        const updatedData = {
          ...serviceData,
          last_push_at: new Date().toISOString(),
          last_pushed_branch: defaultBranch,
          default_branch: serviceData.default_branch || defaultBranch
        };
        await upsertGithubConnection(projectId, updatedData);
        console.log(`Updated GitHub service data for project ${projectId}: branch=${defaultBranch}`);
      } catch (updateError) {
        console.warn('Failed to update GitHub service data after push:', updateError);
        // Don't fail the push operation due to service data update failure
      }
    }
    
    if (res.code === 0) return { success: true, message: res.out.trim() || 'pushed', branch: defaultBranch }
    return { success: false, message: 'push failed', error: res.err.trim() }
  } catch (e: any) {
    return { success: false, message: 'push failed', error: e?.message || String(e) }
  }
}
