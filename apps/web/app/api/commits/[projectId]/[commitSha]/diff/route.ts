export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'
import { resolveProjectRepoPath } from '@repo/config'
import { showDiff } from '@repo/services-git'

export async function GET(_: Request, ctx: { params: { projectId: string; commitSha: string } }) {
  const { projectId, commitSha } = ctx.params
  try {
    const prisma = await getPrisma()
    const row = await (prisma as any).project.findUnique({ where: { id: projectId } })
    if (!row) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
    const repo = resolveProjectRepoPath(projectId)
    const diff = await showDiff(repo, commitSha)
    return NextResponse.json({ diff })
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to get diff' }, { status: 500 })
  }
}
