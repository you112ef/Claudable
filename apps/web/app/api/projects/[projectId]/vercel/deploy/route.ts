export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createDeployment } from '@repo/services-vercel'
import { getPrisma } from '@repo/db'

export async function POST(_: Request, ctx: { params: { projectId: string } }) {
  const { projectId } = ctx.params
  const prisma = await getPrisma()
  const project = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  const res = await createDeployment(projectId)
  if (!res.success) return NextResponse.json({ success: false, message: res.message }, { status: 500 })
  return NextResponse.json({ success: true, deployment_url: res.deployment?.url, deployment_id: res.deployment?.id, status: res.deployment?.state || 'CREATED', message: 'Deployment created' })
}

