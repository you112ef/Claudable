export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'
import { resolveProjectRepoPath } from '@repo/config'
import { listTree } from '@repo/services/repo'

export async function GET(req: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  const url = new URL(req.url)
  const dir = url.searchParams.get('dir') || '.'
  try {
    const prisma = await getPrisma()
    const row = await (prisma as any).project.findUnique({ where: { id: projectId } })
    if (!row) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
    if (row.status === 'initializing') return NextResponse.json({ detail: 'Project is still initializing' }, { status: 400 })
    const repoRoot = resolveProjectRepoPath(projectId)
    // Check repo dir exists
    const fs = await import('node:fs')
    if (!fs.existsSync(repoRoot)) {
      if (row.status === 'failed') return NextResponse.json({ detail: 'Project initialization failed' }, { status: 400 })
      return NextResponse.json({ detail: 'Project repository not found' }, { status: 400 })
    }
    const entries = await listTree(repoRoot, dir)
    const response = NextResponse.json(entries)
    // Reduce log noise for file tree requests
    response.headers.set('x-log-level', 'debug')
    return response
  } catch (e: any) {
    const msg = e?.message || ''
    if (msg === 'Invalid path') return NextResponse.json({ detail: 'Invalid path' }, { status: 400 })
    if (msg === 'Not a directory') return NextResponse.json({ detail: 'Not a directory' }, { status: 400 })
    return NextResponse.json({ detail: 'Failed to list repo' }, { status: 500 })
  }
}
