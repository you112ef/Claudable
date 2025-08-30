export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'
import { getGithubConnection } from '@repo/services-github'

export async function GET(_: Request, ctx: { params: { projectId: string } }) {
  const { projectId } = ctx.params
  const prisma = await getPrisma()
  const project = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  const conn = await getGithubConnection(projectId)
  if (!conn) return NextResponse.json({ connected: false, status: 'not_connected', service_data: {}, created_at: null, updated_at: null })
  return NextResponse.json({ connected: true, status: conn.status, service_data: conn.serviceData ? JSON.parse(conn.serviceData) : {}, created_at: conn.createdAt, updated_at: conn.updatedAt || null })
}

