import { z } from 'zod'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { getPrisma } from '@repo/db'
import { projectsRoot, resolveProjectRepoPath, resolveProjectAssetsPath, projectRoot } from '@repo/config'

export const ProjectIdSchema = z.string().regex(/^[a-z0-9-]{3,}$/)

export const ProjectCreateSchema = z.object({
  project_id: ProjectIdSchema,
  name: z.string().min(1),
  initial_prompt: z.string().optional().nullable(),
  preferred_cli: z.string().optional().default('claude'),
  selected_model: z.string().optional().nullable(),
  fallback_enabled: z.boolean().optional().default(true),
  cli_settings: z.record(z.any()).optional().nullable(),
})

export type ProjectRow = {
  id: string
  name: string
  description?: string | null
  status: string
  preview_url?: string | null
  created_at: Date
  last_active_at?: Date | null
  last_message_at?: Date | null
  services?: Record<string, { connected: boolean; status: string }>
  features?: string[] | null
  tech_stack?: string[] | null
  ai_generated?: boolean | null
  initial_prompt?: string | null
  preferred_cli?: string | null
  selected_model?: string | null
}

function parseSettings(settings: string | null | undefined): any {
  if (!settings) return {}
  try {
    return JSON.parse(settings)
  } catch {
    return {}
  }
}

export async function listProjects(): Promise<ProjectRow[]> {
  const prisma = await getPrisma()
  const projects = await (prisma as any).project.findMany({ orderBy: { createdAt: 'desc' } })
  const rows: ProjectRow[] = []
  for (const p of projects) {
    // Get last_message_at
    const lastMsg = await (prisma as any).message.findFirst({
      where: { projectId: p.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    // Collect services
    const conns = await (prisma as any).projectServiceConnection.findMany({ where: { projectId: p.id } })
    const services: Record<string, { connected: boolean; status: string }> = {}
    for (const c of conns) services[c.provider] = { connected: true, status: c.status }
    for (const provider of ['github', 'supabase', 'vercel']) {
      if (!services[provider]) services[provider] = { connected: false, status: 'disconnected' }
    }
    const ai = parseSettings(p.settings)
    rows.push({
      id: p.id,
      name: p.name,
      description: ai.description ?? null,
      status: p.status ?? 'idle',
      preview_url: p.previewUrl ?? null,
      created_at: p.createdAt,
      last_active_at: p.lastActiveAt ?? null,
      last_message_at: lastMsg?.createdAt ?? null,
      services,
      features: ai.features ?? null,
      tech_stack: ai.tech_stack ?? null,
      ai_generated: ai.ai_generated ?? false,
      initial_prompt: p.initialPrompt ?? null,
      preferred_cli: p.preferredCli ?? null,
      selected_model: p.selectedModel ?? null,
    })
  }
  return rows
}

export async function getProject(projectId: string): Promise<ProjectRow | null> {
  const prisma = await getPrisma()
  const p = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!p) return null
  const ai = parseSettings(p.settings)
  return {
    id: p.id,
    name: p.name,
    description: ai.description ?? null,
    status: p.status ?? 'idle',
    preview_url: p.previewUrl ?? null,
    created_at: p.createdAt,
    last_active_at: p.lastActiveAt ?? null,
    last_message_at: null,
    services: {},
    features: ai.features ?? null,
    tech_stack: ai.tech_stack ?? null,
    ai_generated: ai.ai_generated ?? false,
    initial_prompt: p.initialPrompt ?? null,
    preferred_cli: p.preferredCli ?? null,
    selected_model: p.selectedModel ?? null,
  }
}

export async function createProject(input: z.infer<typeof ProjectCreateSchema>): Promise<ProjectRow> {
  const prisma = await getPrisma()
  // Choose default model when absent
  const preferred = input.preferred_cli ?? 'claude'
  let selected = input.selected_model ?? null
  if (!selected) selected = 'sonnet-4'

  const now = new Date()
  const p = await (prisma as any).project.create({
    data: {
      id: input.project_id,
      name: input.name,
      status: 'initializing',
      previewUrl: null,
      repoPath: null,
      initialPrompt: input.initial_prompt ?? null,
      preferredCli: preferred,
      selectedModel: selected,
      fallbackEnabled: input.fallback_enabled ?? true,
      settings: JSON.stringify({}),
      createdAt: now,
      updatedAt: now,
    },
  })

  // Kick off background initialization (scaffold dirs; optionally init git)
  void initializeProjectBackground(p.id, p.name)

  return (await getProject(p.id)) as ProjectRow
}

export async function updateProject(projectId: string, name: string): Promise<ProjectRow | null> {
  const prisma = await getPrisma()
  const exists = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!exists) return null
  await (prisma as any).project.update({ where: { id: projectId }, data: { name } })
  return (await getProject(projectId)) as ProjectRow
}

export async function deleteProject(projectId: string): Promise<boolean> {
  const prisma = await getPrisma()
  const exists = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!exists) return false
  // Delete related objects
  await (prisma as any).message.deleteMany({ where: { projectId } })
  await (prisma as any).projectServiceConnection.deleteMany({ where: { projectId } })
  await (prisma as any).project.delete({ where: { id: projectId } })
  // Cleanup files
  try { await cleanupProjectFiles(projectId) } catch {}
  return true
}

export async function cleanupProjectFiles(projectId: string): Promise<void> {
  const root = path.join(projectsRoot(), projectId)
  if (!fs.existsSync(root)) return
  await fsp.rm(root, { recursive: true, force: true })
}

export async function initializeProjectBackground(projectId: string, projectName: string): Promise<void> {
  try {
    // Create directories
    const repo = resolveProjectRepoPath(projectId)
    const assets = resolveProjectAssetsPath(projectId)
    await fsp.mkdir(repo, { recursive: true })
    await fsp.mkdir(assets, { recursive: true })
    // Create placeholder .env
    await fsp.writeFile(path.join(repo, '.env'), `NEXT_PUBLIC_PROJECT_ID=${projectId}\nNEXT_PUBLIC_PROJECT_NAME=${projectName}\n`, { flag: 'w' })
    // Init git minimally if available
    await tryInitGit(repo)
    // Update DB status to active and set repo_path
    const prisma = await getPrisma()
    await (prisma as any).project.update({ where: { id: projectId }, data: { status: 'active', repoPath: repo } })
  } catch (e) {
    const prisma = await getPrisma()
    await (prisma as any).project.update({ where: { id: projectId }, data: { status: 'failed' } }).catch(() => {})
  }
}

async function tryInitGit(repoPath: string) {
  const { spawn } = await import('node:child_process')
  async function run(args: string[]) {
    return await new Promise<void>((resolve, reject) => {
      const c = spawn('git', args, { cwd: repoPath })
      c.on('error', reject)
      c.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`git ${args.join(' ')} failed`))))
    })
  }
  try {
    await run(['init'])
    await run(['add', '-A'])
    await run(['commit', '-m', 'Initial commit'])
  } catch {
    // ignore
  }
}

export function loadSystemPrompt(): string {
  // Mirror Python lookup to apps/api/app/prompt/system-prompt.md, with fallbacks
  const candidates = [
    path.join(projectRoot(), 'apps', 'api', 'app', 'prompt', 'system-prompt.md'),
    path.join(projectRoot(), 'docs', 'system-prompt.md'),
    path.join(projectRoot(), 'system-prompt.md'),
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim()
    } catch {}
  }
  return (
    'You are Claude Code, an advanced AI coding assistant specialized in building modern fullstack web applications.\n' +
    'You assist users by chatting with them and making changes to their code in real-time.\n\n' +
    'Constraints:\n' +
    '- Do not delete files entirely; prefer edits.\n' +
    '- Keep changes minimal and focused.\n' +
    '- Use UTF-8 encoding.\n' +
    '- Follow modern development best practices.\n'
  )
}

