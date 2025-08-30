export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'
import { resolveProjectRepoPath } from '@repo/config'
import { readFile } from '@repo/services/repo'

export async function GET(req: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  const url = new URL(req.url)
  const p = url.searchParams.get('path')
  if (!p) return NextResponse.json({ detail: 'Invalid path' }, { status: 400 })
  try {
    const prisma = await getPrisma()
    const row = await (prisma as any).project.findUnique({ where: { id: projectId } })
    if (!row) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
    const repoRoot = resolveProjectRepoPath(projectId)
    const fs = await import('node:fs')
    if (!fs.existsSync(repoRoot)) return NextResponse.json({ detail: 'Project repository not found' }, { status: 400 })
    const res = await readFile(repoRoot, p)
    return NextResponse.json(res)
  } catch (e: any) {
    const msg = e?.message || ''
    if (msg === 'Invalid path') return NextResponse.json({ detail: 'Invalid path' }, { status: 400 })
    if (msg === 'File not found') return NextResponse.json({ detail: 'File not found' }, { status: 404 })
    return NextResponse.json({ detail: 'Failed to read file' }, { status: 500 })
  }
}
