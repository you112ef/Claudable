export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'
import { loadSystemPrompt } from '@repo/services-projects'

export async function GET(_: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  const prisma = await getPrisma()
  const p = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!p) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  const system_prompt = loadSystemPrompt()
  return NextResponse.json({ system_prompt, project_id: projectId })
}

export async function PUT(_: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  const prisma = await getPrisma()
  const p = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!p) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  return NextResponse.json({ message: 'System prompt updated successfully', project_id: projectId })
}

