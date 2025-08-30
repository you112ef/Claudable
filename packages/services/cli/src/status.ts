import { spawn } from 'node:child_process'

function checkCmd(cmd: string, args: string[] = ['--version']): Promise<{ installed: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += String(d)))
    child.stderr.on('data', (d) => (err += String(d)))
    child.on('error', () => resolve({ installed: false, error: 'spawn error' }))
    child.on('close', (code) => resolve({ installed: code === 0, output: out.trim(), error: err.trim() }))
  })
}

export async function getCliStatusSingle(cliType: string) {
  switch (cliType) {
    case 'codex': {
      const r = await checkCmd('codex')
      return { cli_type: 'codex', available: r.installed, configured: r.installed, models: ['gpt-5', 'gpt-4o', 'gpt-4o-mini'] }
    }
    case 'cursor': {
      const r = await checkCmd('cursor-agent', ['-h']).catch(() => ({ installed: false }))
      return { cli_type: 'cursor', available: !!r.installed, configured: !!r.installed, models: ['gpt-5', 'sonnet-4'] }
    }
    case 'claude': {
      const token = process.env.ANTHROPIC_API_KEY
      const available = !!token
      return { cli_type: 'claude', available, configured: available, models: ['claude-sonnet-4', 'claude-opus-4'] }
    }
    case 'qwen': {
      const r = await checkCmd('qwen', ['--version']).catch(() => ({ installed: false }))
      return { cli_type: 'qwen', available: !!r.installed, configured: !!r.installed, models: ['qwen-coder'] }
    }
    case 'gemini': {
      const token = process.env.GOOGLE_API_KEY
      const available = !!token
      return { cli_type: 'gemini', available, configured: available, models: ['gemini-2.5-pro', 'gemini-2.5-flash'] }
    }
    default:
      return { cli_type: cliType, available: false, configured: false, models: [] }
  }
}

export async function getAllCliStatus(preferred_cli: string) {
  const [claude, cursor, codex, qwen, gemini] = await Promise.all([
    getCliStatusSingle('claude'),
    getCliStatusSingle('cursor'),
    getCliStatusSingle('codex'),
    getCliStatusSingle('qwen'),
    getCliStatusSingle('gemini'),
  ])
  return { claude, cursor, codex, qwen, gemini, preferred_cli }
}
