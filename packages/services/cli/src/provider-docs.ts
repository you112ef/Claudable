import fsp from 'node:fs/promises'
import fs from 'node:fs'
import path from 'node:path'
import { loadSystemPrompt } from '@repo/services-projects'
import { projectRoot } from '@repo/config'

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

export async function ensureClaudeConfig(repoPath: string) {
  try {
    const root = projectRoot()
    const scriptsDir = path.join(root, 'scripts')
    const settingsSrc = path.join(scriptsDir, 'settings.json')
    const hookSrc = path.join(scriptsDir, 'type_check.sh')
    const claudeDir = path.join(repoPath, '.claude')
    const hooksDir = path.join(claudeDir, 'hooks')
    await fsp.mkdir(hooksDir, { recursive: true })
    if (fs.existsSync(settingsSrc)) {
      const dst = path.join(claudeDir, 'settings.json')
      await fsp.copyFile(settingsSrc, dst)
    }
    if (fs.existsSync(hookSrc)) {
      const dst = path.join(hooksDir, 'type_check.sh')
      await fsp.copyFile(hookSrc, dst)
      try { await fsp.chmod(dst, 0o755) } catch {}
    }
  } catch {}
}
