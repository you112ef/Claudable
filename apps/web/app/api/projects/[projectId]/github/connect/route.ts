export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'
import { createRepo, getAuthedUser, upsertGithubConnection } from '@repo/services-github'
import { spawn } from 'node:child_process'

export async function POST(req: Request, ctx: { params: { projectId: string } }) {
  const { projectId } = ctx.params
  const prisma = await getPrisma()
  const project = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  try {
    const body = await req.json().catch(() => ({}))
    const repoName: string = body?.project_name || projectId
    const user = await getAuthedUser()
    const repo = await createRepo(repoName, body?.description || '')
    const connectionId = await upsertGithubConnection(projectId, { full_name: repo.full_name, html_url: repo.html_url, owner: user.login, name: repo.name })

    // Configure local git remote (no push)
    try {
      if (project.repoPath) {
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
          const child = spawn('git', ['remote', 'add', 'origin', `https://github.com/${repo.full_name}.git`], { cwd: project.repoPath as string, stdio: 'ignore' })
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
