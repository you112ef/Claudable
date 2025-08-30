export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'
import { z } from 'zod' 

const Body = z.object({ model_id: z.string().min(1) })
export async function POST(req: Request, ctx: { params: { projectId: string } }) {
  const { projectId } = ctx.params
  const body = await req.json().catch(() => null)
  const parsed = Body.safeParse(body)
  if (!parsed.success) return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  const prisma = await getPrisma()
  const p = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!p) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  await (prisma as any).project.update({ where: { id: projectId }, data: { selectedModel: parsed.data.model_id } })
  return NextResponse.json({ selected_model: parsed.data.model_id, message: 'Model preference updated' })
}

