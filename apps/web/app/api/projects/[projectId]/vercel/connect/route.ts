export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'
import { connectVercelProject } from '@repo/services-vercel'

export async function POST(req: Request, ctx: { params: { projectId: string } }) {
  const { projectId } = ctx.params
  const prisma = await getPrisma()
  const project = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  try {
    const body = await req.json().catch(() => ({}))
    const name = body?.project_name || projectId
    const res = await connectVercelProject(projectId, name)
    return NextResponse.json({ success: res.success, project_url: res.project?.url || null, message: res.message })
  } catch (e: any) {
    const msg = e?.message || 'Failed to connect Vercel'
    const status = /token|auth|unauthorized/i.test(msg) ? 401 : 500
    return NextResponse.json({ success: false, message: msg }, { status })
  }
}

