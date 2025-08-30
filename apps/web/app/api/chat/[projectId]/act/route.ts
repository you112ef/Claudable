export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ActRequestSchema, executeInstruction } from '@repo/services-cli' 

export async function POST(req: Request, ctx: { params: { projectId: string } }) {
  const { projectId } = ctx.params
  const body = await req.json().catch(() => null)
  const parsed = ActRequestSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  try {
    const res = await executeInstruction(projectId, parsed.data, 'act')
    return NextResponse.json(res)
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to execute act' }, { status: 500 })
  }
}

