import { NextRequest, NextResponse } from 'next/server';
import { getProject, upsertProject } from '@/lib/server/store';

export async function POST(_req: NextRequest, { params }: { params: { projectId: string } }) {
  const project = await getProject(params.projectId);
  if (!project) return NextResponse.json({ detail: 'Not found' }, { status: 404 });
  const updated = {
    ...project,
    status: 'preview_running',
    preview_url: project.preview_url || 'http://localhost:3200',
    last_active_at: new Date().toISOString(),
  };
  await upsertProject(updated);
  return NextResponse.json({ running: true, port: 3200, url: updated.preview_url, process_id: null });
}

