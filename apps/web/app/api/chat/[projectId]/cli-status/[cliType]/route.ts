export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db' 

export async function GET(_: Request, ctx: { params: { projectId: string; cliType: string } }) {
  const { projectId, cliType } = ctx.params
  const prisma = await getPrisma()
  const p = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!p) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  return NextResponse.json({ cli_type: cliType, available: false, configured: false, models: [] })
}

