export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { listProjects, createProject, ProjectCreateSchema } from '@repo/services-projects'

export async function GET() {
  try {
    const rows = await listProjects()
    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to list projects' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = ProjectCreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  try {
    const created = await createProject(parsed.data)
    return NextResponse.json(created)
  } catch (e: any) {
    const msg = e?.message || ''
    if (msg.includes('Unique')) return NextResponse.json({ detail: `Project ${parsed.data.project_id} already exists` }, { status: 409 })
    return NextResponse.json({ detail: 'Failed to create project' }, { status: 500 })
  }
}
