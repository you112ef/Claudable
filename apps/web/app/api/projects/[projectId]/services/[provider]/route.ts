export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'

export async function POST(req: Request, ctx: { params: { projectId: string; provider: string } }) {
  const { projectId, provider } = ctx.params
  const prisma = await getPrisma()
  const project = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  const body = await req.json().catch(() => ({}))
  const data = body?.service_data || {}
  const id = ((globalThis as any).crypto?.randomUUID?.() || require('node:crypto').randomUUID()) as string
  const existing = await (prisma as any).projectServiceConnection.findFirst({ where: { projectId, provider } })
  if (existing) {
    await (prisma as any).projectServiceConnection.update({ where: { id: existing.id }, data: { status: 'connected', serviceData: JSON.stringify(data), updatedAt: new Date() } })
    return NextResponse.json({ message: 'Updated', connection_id: existing.id })
  }
  const row = await (prisma as any).projectServiceConnection.create({ data: { id, projectId, provider, status: 'connected', serviceData: JSON.stringify(data), createdAt: new Date() } })
  return NextResponse.json({ message: 'Created', connection_id: row.id })
}

export async function DELETE(_: Request, ctx: { params: { projectId: string; provider: string } }) {
  const { projectId, provider } = ctx.params
  const prisma = await getPrisma()
  const project = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  const row = await (prisma as any).projectServiceConnection.findFirst({ where: { projectId, provider } })
  if (row) await (prisma as any).projectServiceConnection.delete({ where: { id: row.id } })
  return NextResponse.json({ message: 'Deleted' })
}

