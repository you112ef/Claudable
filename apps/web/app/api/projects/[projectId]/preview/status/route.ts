export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getStatus } from '@repo/services-preview-runtime'

export async function GET(_: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  const s = getStatus(projectId)
  return NextResponse.json({ running: s.running, port: null, url: null, process_id: null, error: null })
}

