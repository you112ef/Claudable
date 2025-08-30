import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

export type RepoEntry = { path: string; type: 'file' | 'dir'; size?: number }

export function safeJoin(root: string, rel: string): string {
  const full = path.normalize(path.join(root, rel))
  const rootNorm = path.normalize(root)
  if (!full.startsWith(rootNorm + path.sep) && full !== rootNorm) {
    throw new Error('Invalid path')
  }
  return full
}

export async function listTree(repoRoot: string, relDir: string = '.'): Promise<RepoEntry[]> {
  const target = safeJoin(repoRoot, relDir)
  const stat = await fsp.stat(target)
  if (!stat.isDirectory()) throw new Error('Not a directory')
  const entries = await fsp.readdir(target)
  const items: RepoEntry[] = []
  // Sort dirs first then files, by name (case-insensitive)
  entries.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  for (const name of entries) {
    const child = path.join(target, name)
    const st = await fsp.stat(child)
    const rel = path.relative(repoRoot, child)
    if (st.isDirectory()) items.push({ path: rel, type: 'dir' })
    else items.push({ path: rel, type: 'file', size: st.size })
  }
  // Ensure dirs before files like the Python implementation
  items.sort((a, b) => (a.type === 'file' ? 1 : 0) - (b.type === 'file' ? 1 : 0) || a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }))
  return items
}

export async function readFile(repoRoot: string, relPath: string): Promise<{ path: string; content: string }> {
  const full = safeJoin(repoRoot, relPath)
  const st = await fsp.stat(full).catch(() => null)
  if (!st || !st.isFile()) throw new Error('File not found')
  const buf = await fsp.readFile(full)
  const content = buf.toString('utf8')
  return { path: relPath, content }
}

