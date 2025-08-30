export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'

export async function GET(_: Request, ctx: { params: { projectId: string; sessionId: string } }) {
  const { projectId, sessionId } = ctx.params
  try {
    const prisma = await getPrisma()
    const s = await (prisma as any).session.findUnique({ where: { id: sessionId } })
    if (!s || s.projectId !== projectId) return NextResponse.json({ detail: 'Not found' }, { status: 404 })
    return NextResponse.json({
      session_id: s.id,
      status: s.status,
      cli_type: s.cliType,
      instruction: s.instruction ?? null,
      started_at: s.startedAt ?? null,
      completed_at: s.completedAt ?? null,
      duration_ms: s.durationMs ?? null,
    })
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to get session status' }, { status: 500 })
  }
}

