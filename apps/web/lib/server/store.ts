import { promises as fs } from 'fs';
import path from 'path';

export type Project = {
  id: string;
  name: string;
  status?: string;
  preview_url?: string | null;
  created_at: string;
  last_active_at?: string | null;
  last_message_at?: string | null;
  initial_prompt?: string | null;
  preferred_cli?: string | null;
  selected_model?: string | null;
  services?: {
    github?: { connected: boolean; status: string };
    supabase?: { connected: boolean; status: string };
    vercel?: { connected: boolean; status: string };
  };
};

const rootDir = path.resolve(process.cwd(), '../../');
const dataDir = path.join(rootDir, 'data');
const projectsFile = path.join(dataDir, 'projects.json');
const uploadsDir = path.join(dataDir, 'uploads');

async function ensureDirs() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(uploadsDir, { recursive: true });
}

export async function readProjects(): Promise<Project[]> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(projectsFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Project[];
    return [];
  } catch (e: any) {
    if (e && e.code === 'ENOENT') return [];
    throw e;
  }
}

export async function writeProjects(projects: Project[]) {
  await ensureDirs();
  await fs.writeFile(projectsFile, JSON.stringify(projects, null, 2), 'utf8');
}

export async function upsertProject(project: Project): Promise<Project> {
  const list = await readProjects();
  const idx = list.findIndex(p => p.id === project.id);
  if (idx >= 0) list[idx] = project; else list.unshift(project);
  await writeProjects(list);
  return project;
}

export async function getProject(id: string): Promise<Project | undefined> {
  const list = await readProjects();
  return list.find(p => p.id === id);
}

export async function deleteProject(id: string): Promise<boolean> {
  const list = await readProjects();
  const next = list.filter(p => p.id !== id);
  const changed = next.length !== list.length;
  if (changed) await writeProjects(next);
  return changed;
}

export async function ensureProjectUploadDir(projectId: string): Promise<string> {
  await ensureDirs();
  const dir = path.join(uploadsDir, projectId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function absolutePathForUpload(projectId: string, filename: string): string {
  return path.join(uploadsDir, projectId, filename);
}

