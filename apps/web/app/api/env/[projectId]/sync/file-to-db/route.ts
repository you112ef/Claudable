export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { projectExists, syncFileToDb } from '@repo/services-env'

export async function POST(_: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  if (!(await projectExists(projectId))) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  try {
    const count = await syncFileToDb(projectId)
    return NextResponse.json({ success: true, synced_count: count, message: `Synced ${count} environment variables from .env file to database` })
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to sync file to DB' }, { status: 500 })
  }
}
