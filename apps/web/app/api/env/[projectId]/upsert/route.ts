export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { projectExists, envVarExists, updateEnvVar, createEnvVar, EnvVarCreateSchema } from '@repo/services-env'

export async function POST(req: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  if (!(await projectExists(projectId))) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  const body = await req.json().catch(() => null)
  const parsed = EnvVarCreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  const { key, value } = parsed.data
  try {
    if (await envVarExists(projectId, key)) {
      await updateEnvVar(projectId, key, value)
      return NextResponse.json({ success: true, message: `Environment variable '${key}' updated and synced to .env file` })
    } else {
      const row = await createEnvVar(projectId, parsed.data)
      return NextResponse.json({ success: true, message: `Environment variable '${key}' created and synced to .env file`, id: row.id })
    }
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to upsert env var' }, { status: 500 })
  }
}
