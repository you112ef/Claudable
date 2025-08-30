export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'
import { createRepo, getAuthedUser, upsertGithubConnection } from '@repo/services-github'

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
    return NextResponse.json({ success: true, repo_url: repo.html_url, message: 'GitHub connected', connection_id: connectionId })
  } catch (e: any) {
    const msg = e?.message || 'Failed to connect GitHub'
    const status = /token|auth|unauthorized/i.test(msg) ? 401 : 500
    return NextResponse.json({ success: false, message: msg }, { status })
  }
}

