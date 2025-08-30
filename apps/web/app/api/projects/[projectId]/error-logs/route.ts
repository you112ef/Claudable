export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getAllErrorLogs } from '@repo/services/preview-runtime'

export async function GET(_: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  const logs = getAllErrorLogs(projectId)
  return NextResponse.json({ logs, project_id: projectId })
}
