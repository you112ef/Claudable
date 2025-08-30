export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'

export async function GET(_: Request, ctx: { params: { projectId: string } }) {
  const { projectId } = ctx.params
  try {
    const prisma = await getPrisma()
    const s = await (prisma as any).session.findFirst({
      where: { projectId, OR: [{ status: 'active' }, { status: 'running' }] },
      orderBy: { startedAt: 'desc' },
    })
    if (!s) return NextResponse.json({ session_id: null, status: null, cli_type: null, instruction: null, started_at: null })
    return NextResponse.json({ session_id: s.id, status: s.status, cli_type: s.cliType, instruction: s.instruction ?? null, started_at: s.startedAt ?? null })
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to get active session' }, { status: 500 })
  }
}

