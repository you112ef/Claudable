export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db' 
import { getAllCliStatus } from '@repo/services-cli/src/status'

export async function GET(_: Request, ctx: { params: { projectId: string } }) {
  const { projectId } = ctx.params
  const prisma = await getPrisma()
  const p = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!p) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  const preferred_cli = p.preferredCli ?? 'claude'
  const status = await getAllCliStatus(preferred_cli)
  return NextResponse.json(status)
}

