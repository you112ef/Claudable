export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getConnectionStatus } from '@repo/services-vercel'
import { getPrisma } from '@repo/db'

export async function GET(_: Request, ctx: { params: { projectId: string } }) {
  const { projectId } = ctx.params
  const prisma = await getPrisma()
  const project = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  const status = await getConnectionStatus(projectId)
  return NextResponse.json(status)
}

