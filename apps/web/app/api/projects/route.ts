import { NextRequest, NextResponse } from 'next/server';
import { readProjects, upsertProject, type Project } from '@/lib/server/store';

export async function GET() {
  const projects = await readProjects();
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id: string = body.project_id || body.id;
    const name: string = body.name || 'Untitled Project';
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ detail: 'project_id is required' }, { status: 400 });
    }
    const now = new Date().toISOString();
    const project: Project = {
      id,
      name,
      created_at: now,
      last_active_at: now,
      last_message_at: null,
      initial_prompt: body.initial_prompt || null,
      preferred_cli: body.preferred_cli || null,
      selected_model: body.selected_model || null,
      status: 'idle',
      preview_url: null,
      services: {}
    };
    await upsertProject(project);
    return NextResponse.json(project, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ detail: e?.message || 'Invalid request' }, { status: 400 });
  }
}

