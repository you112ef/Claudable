export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'

export async function GET(_: Request, ctx: { params: { projectId: string; provider: string } }) {
  const { projectId, provider } = ctx.params
  const prisma = await getPrisma()
  const project = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  const row = await (prisma as any).projectServiceConnection.findFirst({ where: { projectId, provider } })
  if (!row) return NextResponse.json({ connected: false, status: 'not_connected' })
  return NextResponse.json({ connected: true, status: row.status, service_data: row.serviceData ? JSON.parse(row.serviceData) : {}, last_sync_at: row.lastSyncAt || null })
}

