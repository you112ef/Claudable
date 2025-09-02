export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'
import { pushToGithub } from '@repo/services-github'

export async function POST(req: Request, ctx: { params: { projectId: string } }) {
  const { projectId } = ctx.params
  const body = await req.json().catch(() => ({})) as { branch?: string }
  
  const prisma = await getPrisma()
  const project = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  if (!project.repoPath) return NextResponse.json({ success: false, message: 'No repo path' }, { status: 400 })
  
  const res = await pushToGithub(projectId, project.repoPath, body.branch)
  return NextResponse.json(res, { status: res.success ? 200 : 500 })
}

