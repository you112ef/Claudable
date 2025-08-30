export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db' 

export async function GET(_: Request, ctx: { params: { projectId: string } }) {
  const { projectId } = ctx.params
  const prisma = await getPrisma()
  const p = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!p) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  const preferred_cli = p.preferredCli ?? 'claude'
  const resp: any = {
    claude: { cli_type: 'claude', available: false, configured: false, models: [] },
    cursor: { cli_type: 'cursor', available: false, configured: false, models: [] },
    codex: { cli_type: 'codex', available: false, configured: false, models: [] },
    qwen: { cli_type: 'qwen', available: false, configured: false, models: [] },
    gemini: { cli_type: 'gemini', available: false, configured: false, models: [] },
    preferred_cli,
  }
  return NextResponse.json(resp)
}

