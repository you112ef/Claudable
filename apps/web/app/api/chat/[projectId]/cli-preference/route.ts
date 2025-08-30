export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'
import { z } from 'zod' 

export async function GET(_: Request, ctx: { params: { projectId: string } }) {
  const { projectId } = ctx.params
  const prisma = await getPrisma()
  const p = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!p) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  return NextResponse.json({ preferred_cli: p.preferredCli ?? 'claude', selected_model: p.selectedModel ?? null })
}

const PrefSchema = z.object({ preferred_cli: z.string().min(1) })
export async function POST(req: Request, ctx: { params: { projectId: string } }) {
  const { projectId } = ctx.params
  const body = await req.json().catch(() => null)
  const parsed = PrefSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  const prisma = await getPrisma()
  const p = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!p) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  await (prisma as any).project.update({ where: { id: projectId }, data: { preferredCli: parsed.data.preferred_cli } })
  return NextResponse.json({ preferred_cli: parsed.data.preferred_cli, message: 'CLI preference updated' })
}

