export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'
import { startPreview } from '@repo/services-preview-runtime'

export async function POST(req: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  const body = await req.json().catch(() => ({})) as { port?: number }
  const prisma = await getPrisma()
  const p = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!p) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  const repo = p.repoPath as string | null
  if (!repo) return NextResponse.json({ detail: 'Project repository path not found' }, { status: 400 })
  const result = await startPreview(projectId, repo, body?.port)
  if (!result.running) {
    return NextResponse.json({ running: false, error: result.error ?? 'Failed to start preview', port: result.port ?? undefined, url: result.url ?? undefined }, { status: 500 })
  }
  await (prisma as any).project.update({ where: { id: projectId }, data: { status: 'preview_running', previewUrl: result.url ?? null } }).catch(() => {})
  return NextResponse.json({ running: true, port: result.port, url: result.url, process_id: result.process_id ?? null, error: null })
}

