import path from 'node:path'
import fs from 'node:fs'
import url from 'node:url'
import dotenv from 'dotenv'

// Load environment variables from project root .env if present
let envLoaded = false
export function loadEnv() {
  if (envLoaded) return
  try {
    const root = projectRoot()
    const envPath = path.join(root, '.env')
    if (fs.existsSync(envPath)) dotenv.config({ path: envPath })
  } catch {}
  envLoaded = true
}

export function projectRoot(): string {
  // Resolve from this file location to monorepo root
  const __filename = url.fileURLToPath(import.meta.url)
  const start = path.dirname(__filename)
  let dir = start
  for (let i = 0; i < 6; i++) {
    const candidate = i === 0 ? dir : path.dirname(dir)
    if (
      fs.existsSync(path.join(candidate, 'package.json')) &&
      fs.existsSync(path.join(candidate, 'apps'))
    ) {
      return candidate
    }
    dir = path.dirname(dir)
  }
  // Fallback to CWD
  return process.cwd()
}

export function dataDir(): string {
  loadEnv()
  const root = projectRoot()
  return process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data')
}

export function projectsRoot(): string {
  loadEnv()
  return process.env.PROJECTS_ROOT
    ? path.resolve(process.env.PROJECTS_ROOT)
    : path.join(dataDir(), 'projects')
}

export function databaseUrl(): string {
  loadEnv()
  const urlEnv = process.env.DATABASE_URL
  if (urlEnv && urlEnv.trim().length > 0) return urlEnv
  const dbPath = path.join(dataDir(), 'cc.db')
  return `sqlite:///${dbPath}`
}

export function prismaDatabaseUrl(): string {
  // Convert DATABASE_URL to Prisma-compatible file: URL when using sqlite
  const dbUrl = databaseUrl()
  if (dbUrl.startsWith('sqlite:///')) {
    const p = dbUrl.replace('sqlite:///', '')
    return `file:${p}`
  }
  return dbUrl
}

export function previewPorts(): { start: number; end: number } {
  loadEnv()
  const start = parseInt(process.env.PREVIEW_PORT_START || '3100', 10)
  const end = parseInt(process.env.PREVIEW_PORT_END || '3999', 10)
  return { start, end }
}

export function ensureDataDirs() {
  const data = dataDir()
  const proj = projectsRoot()
  fs.mkdirSync(data, { recursive: true })
  fs.mkdirSync(proj, { recursive: true })
}

export function resolveProjectRepoPath(projectId: string): string {
  return path.join(projectsRoot(), projectId, 'repo')
}

export function resolveProjectAssetsPath(projectId: string): string {
  return path.join(projectsRoot(), projectId, 'assets')
}

