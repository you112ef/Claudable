export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'

export async function POST(_: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  const prisma = await getPrisma()
  const p = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!p) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  return NextResponse.json({ message: 'System prompt reset to default', project_id: projectId })
}

