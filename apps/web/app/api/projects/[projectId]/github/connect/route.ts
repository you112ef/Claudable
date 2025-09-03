export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'
import { createRepo, getAuthedUser, upsertGithubConnection, isRepoAvailable, getRepoDetails } from '@repo/services-github'
import { getPlainToken } from '@repo/services/tokens'
import { spawn } from 'node:child_process'

export async function POST(req: Request, ctx: { params: { projectId: string } }) {
  const { projectId } = ctx.params
  const prisma = await getPrisma()
  const project = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  try {
    const body = await req.json().catch(() => ({})) as { repo_name?: string; project_name?: string; description?: string; private?: boolean }
    // Prefer client-provided repo_name, fallback to project_name, then projectId
    const desiredName: string = (body?.repo_name || body?.project_name || String(projectId)).trim()
    // Sanitize to a valid GitHub repo name (server-side defense-in-depth)
    const repoName: string = desiredName
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9._-]/g, '')
      .replace(/[-]{2,}/g, '-')
      .replace(/[.]{2,}/g, '.')
      .replace(/^[.-]+|[.-]+$/g, '')
      .substring(1-1, 100)
    
    const user = await getAuthedUser()
    
    // If repository already exists, connect to it instead of failing with 422
    try {
      const avail = await isRepoAvailable(repoName)
      if (!avail.available) {
        const existing = await getRepoDetails(user.login, repoName)
        const connectionId = await upsertGithubConnection(projectId, {
          full_name: existing.full_name,
          html_url: existing.html_url,
          clone_url: existing.clone_url,
          ssh_url: existing.ssh_url,
          owner: user.login,
          name: existing.name,
          default_branch: existing.default_branch || 'main',
          private: existing.private === true,
          repo_id: existing.id,
          username: user.login,
        })
        // Configure local git remote with PAT (no push)
        try {
          if (project.repoPath) {
            const ghToken = await getPlainToken('github')
            const originUrl = ghToken ? `https://${user.login}:${ghToken}@github.com/${existing.full_name}.git` : `https://github.com/${existing.full_name}.git`
            // basic user config
            const email = `${user.login}@users.noreply.github.com`
            await new Promise<void>((resolve) => { const c = spawn('git', ['config', 'user.name', user.login], { cwd: project.repoPath as string, stdio: 'ignore' }); c.on('close', () => resolve()); c.on('error', () => resolve()); })
            await new Promise<void>((resolve) => { const c = spawn('git', ['config', 'user.email', email], { cwd: project.repoPath as string, stdio: 'ignore' }); c.on('close', () => resolve()); c.on('error', () => resolve()); })
            await new Promise<void>((resolve) => { const child = spawn('git', ['remote', 'get-url', 'origin'], { cwd: project.repoPath as string, stdio: 'ignore' }); child.on('close', () => resolve()); child.on('error', () => resolve()); })
            await new Promise<void>((resolve) => { const child = spawn('git', ['remote', 'remove', 'origin'], { cwd: project.repoPath as string, stdio: 'ignore' }); child.on('close', () => resolve()); child.on('error', () => resolve()); })
            await new Promise<void>((resolve) => { const child = spawn('git', ['remote', 'add', 'origin', originUrl], { cwd: project.repoPath as string, stdio: 'ignore' }); child.on('close', () => resolve()); child.on('error', () => resolve()); })
            await new Promise<void>((resolve) => { const child = spawn('git', ['branch', '-M', 'main'], { cwd: project.repoPath as string, stdio: 'ignore' }); child.on('close', () => resolve()); child.on('error', () => resolve()); })
          }
        } catch {}
        return NextResponse.json({ success: true, repo_url: existing.html_url, message: 'GitHub repository connected (existing)', connection_id: connectionId })
      }
    } catch {}
    
    const repo = await createRepo(repoName, body?.description || '', body?.private === true)
    const connectionId = await upsertGithubConnection(projectId, {
      full_name: repo.full_name,
      html_url: repo.html_url,
      clone_url: repo.clone_url,
      ssh_url: repo.ssh_url,
      owner: user.login,
      name: repo.name,
      default_branch: repo.default_branch || 'main',
      private: repo.private === true,
      repo_id: repo.id,
      username: user.login,
      repo_url: repo.html_url,
      repo_name: repo.name,
    })

    // Configure local git remote with PAT (no push)
    try {
      if (project.repoPath) {
        const ghToken = await getPlainToken('github')
        const originUrl = ghToken ? `https://${user.login}:${ghToken}@github.com/${repo.full_name}.git` : `https://github.com/${repo.full_name}.git`
        const email = `${user.login}@users.noreply.github.com`
        await new Promise<void>((resolve) => { const c = spawn('git', ['config', 'user.name', user.login], { cwd: project.repoPath as string, stdio: 'ignore' }); c.on('close', () => resolve()); c.on('error', () => resolve()); })
        await new Promise<void>((resolve) => { const c = spawn('git', ['config', 'user.email', email], { cwd: project.repoPath as string, stdio: 'ignore' }); c.on('close', () => resolve()); c.on('error', () => resolve()); })
        await new Promise<void>((resolve) => {
          const child = spawn('git', ['remote', 'get-url', 'origin'], { cwd: project.repoPath as string, stdio: 'ignore' })
          child.on('close', (code) => resolve())
          child.on('error', () => resolve())
        })
        // Set/replace origin
        await new Promise<void>((resolve) => {
          const child = spawn('git', ['remote', 'remove', 'origin'], { cwd: project.repoPath as string, stdio: 'ignore' })
          child.on('close', () => resolve())
          child.on('error', () => resolve())
        })
        await new Promise<void>((resolve) => {
          const child = spawn('git', ['remote', 'add', 'origin', originUrl], { cwd: project.repoPath as string, stdio: 'ignore' })
          child.on('close', () => resolve())
          child.on('error', () => resolve())
        })
        await new Promise<void>((resolve) => {
          const child = spawn('git', ['branch', '-M', 'main'], { cwd: project.repoPath as string, stdio: 'ignore' })
          child.on('close', () => resolve())
          child.on('error', () => resolve())
        })
      }
    } catch {}
    return NextResponse.json({ success: true, repo_url: repo.html_url, message: 'GitHub connected', connection_id: connectionId })
  } catch (e: any) {
    const msg = e?.message || 'Failed to connect GitHub'
    const status = /token|auth|unauthorized/i.test(msg) ? 401 : 500
    return NextResponse.json({ success: false, message: msg }, { status })
  }
}
