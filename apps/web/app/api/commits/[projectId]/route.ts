export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'
import { resolveProjectRepoPath } from '@repo/config'
import { listCommits } from '@repo/services/git'

export async function GET(_: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  try {
    const prisma = await getPrisma()
    const row = await (prisma as any).project.findUnique({ where: { id: projectId } })
    if (!row) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
    const repo = resolveProjectRepoPath(projectId)
    const commits = await listCommits(repo)
    return NextResponse.json(commits)
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to list commits' }, { status: 500 })
  }
}
