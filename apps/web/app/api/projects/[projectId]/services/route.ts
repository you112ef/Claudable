export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'

export async function GET(_: Request, ctx: { params: { projectId: string } }) {
  const { projectId } = ctx.params
  const prisma = await getPrisma()
  const project = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  const rows = await (prisma as any).projectServiceConnection.findMany({ where: { projectId } })
  const connections = rows.map((r: any) => ({ id: r.id, provider: r.provider, status: r.status, service_data: r.serviceData ? JSON.parse(r.serviceData) : {}, created_at: r.createdAt, updated_at: r.updatedAt || null, last_sync_at: r.lastSyncAt || null }))
  return NextResponse.json(connections)
}

