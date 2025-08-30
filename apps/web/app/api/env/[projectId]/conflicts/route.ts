export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { projectExists, getConflicts } from '@repo/services-env'

export async function GET(_: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  if (!(await projectExists(projectId))) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  try {
    const conflicts = await getConflicts(projectId)
    return NextResponse.json({ conflicts, has_conflicts: conflicts.length > 0 })
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to check conflicts' }, { status: 500 })
  }
}
