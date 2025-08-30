import fsp from 'node:fs/promises'
import path from 'node:path'
import { loadSystemPrompt } from '@repo/services-projects'

async function ensureFile(filePath: string, content: string) {
  try {
    await fsp.access(filePath)
    return
  } catch {}
  try {
    await fsp.writeFile(filePath, content, 'utf8')
  } catch {}
}

export async function ensureGeminiMd(repoPath: string) {
  const p = path.join(repoPath, 'GEMINI.md')
  const body = loadSystemPrompt()
  const content = `# GEMINI\n\n${body}\n`
  await ensureFile(p, content)
}

export async function ensureQwenMd(repoPath: string) {
  const p = path.join(repoPath, 'QWEN.md')
  const body = loadSystemPrompt()
  const content = `# QWEN\n\n${body}\n`
  await ensureFile(p, content)
}

