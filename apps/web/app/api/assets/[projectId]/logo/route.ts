export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assetsDir, writeBytes, projectExists } from '@repo/services/assets'

const BodySchema = z.object({ b64_png: z.string().min(1) })

export async function POST(req: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  if (!(await projectExists(projectId))) {
    return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  }
  const body = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  try {
    const data = Buffer.from(parsed.data.b64_png, 'base64')
    const dir = assetsDir(projectId)
    await writeBytes(require('node:path').join(dir, 'logo.png'), data)
    return NextResponse.json({ path: 'assets/logo.png' })
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to save logo' }, { status: 500 })
  }
}
