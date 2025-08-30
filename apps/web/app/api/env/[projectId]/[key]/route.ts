export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { projectExists, updateEnvVar, deleteEnvVar } from '@repo/services-env'

const UpdateSchema = z.object({ value: z.string() })

export async function PUT(req: Request, ctx: { params: { projectId: string; key: string } }) {
  const { projectId, key } = ctx.params
  if (!(await projectExists(projectId))) {
    return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  }
  const body = await req.json().catch(() => null)
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  try {
    const ok = await updateEnvVar(projectId, key, parsed.data.value)
    if (!ok) return NextResponse.json({ detail: `Environment variable '${key}' not found` }, { status: 404 })
    return NextResponse.json({ success: true, message: `Environment variable '${key}' updated and synced to .env file` })
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to update env var' }, { status: 500 })
  }
}

export async function DELETE(_: Request, ctx: { params: { projectId: string; key: string } }) {
  const { projectId, key } = ctx.params
  if (!(await projectExists(projectId))) {
    return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  }
  try {
    const ok = await deleteEnvVar(projectId, key)
    if (!ok) return NextResponse.json({ detail: `Environment variable '${key}' not found` }, { status: 404 })
    return NextResponse.json({ success: true, message: `Environment variable '${key}' deleted and synced to .env file` })
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to delete env var' }, { status: 500 })
  }
}
