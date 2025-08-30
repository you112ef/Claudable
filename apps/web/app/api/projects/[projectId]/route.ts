export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getProject, updateProject, deleteProject as deleteProjectSvc } from '@repo/services/projects'

export async function GET(_: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  try {
    const row = await getProject(projectId)
    if (!row) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to get project' }, { status: 500 })
  }
}

export async function PUT(req: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  const body = await req.json().catch(() => null)
  const name = body?.name
  if (!name || typeof name !== 'string') return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  try {
    const row = await updateProject(projectId, name)
    if (!row) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to update project' }, { status: 500 })
  }
}

export async function DELETE(_: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  try {
    const ok = await deleteProjectSvc(projectId)
    if (!ok) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
    return NextResponse.json({ message: `Project ${projectId} deleted successfully` })
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to delete project' }, { status: 500 })
  }
}
