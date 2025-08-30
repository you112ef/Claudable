export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  projectExists,
  loadDecryptedRows,
  createEnvVar,
  EnvVarCreateSchema,
} from '@repo/services-env'

export async function GET(_: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  if (!(await projectExists(projectId))) {
    return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  }
  try {
    const rows = await loadDecryptedRows(projectId)
    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        key: r.key,
        value: r.value,
        scope: r.scope,
        var_type: r.var_type,
        is_secret: r.is_secret,
        description: r.description ?? null,
      }))
    )
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to get env vars' }, { status: 500 })
  }
}

export async function POST(req: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  if (!(await projectExists(projectId))) {
    return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  }
  const body = await req.json().catch(() => null)
  const parsed = EnvVarCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  }
  try {
    const row = await createEnvVar(projectId, parsed.data)
    return NextResponse.json({
      success: true,
      message: `Environment variable '${parsed.data.key}' created and synced to .env file`,
      id: row.id,
    })
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to create env var' }, { status: 500 })
  }
}
