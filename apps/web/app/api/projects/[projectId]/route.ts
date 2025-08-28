import { NextRequest, NextResponse } from 'next/server';
import { getProject, upsertProject, deleteProject } from '@/lib/server/store';

export async function GET(_req: NextRequest, { params }: { params: { projectId: string } }) {
  const project = await getProject(params.projectId);
  if (!project) return NextResponse.json({ detail: 'Not found' }, { status: 404 });
  return NextResponse.json(project);
}

export async function PUT(req: NextRequest, { params }: { params: { projectId: string } }) {
  const project = await getProject(params.projectId);
  if (!project) return NextResponse.json({ detail: 'Not found' }, { status: 404 });
  try {
    const body = await req.json();
    const updated = { ...project, ...('name' in body ? { name: String(body.name || project.name) } : {}), last_active_at: new Date().toISOString() };
    await upsertProject(updated);
    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json({ detail: e?.message || 'Invalid request' }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { projectId: string } }) {
  const ok = await deleteProject(params.projectId);
  if (!ok) return NextResponse.json({ detail: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

