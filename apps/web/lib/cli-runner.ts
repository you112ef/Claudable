import { spawn } from 'child_process'

export type CLIType = 'claude' | 'cursor'

export interface CLIRunOptions {
  cli: CLIType
  instruction: string
  model?: string | null
  cwd?: string
}

export interface CLIAvailability {
  available: boolean
  configured: boolean
  message?: string
}

export function mapModelForCLI(cli: CLIType, model?: string | null): string | undefined {
  if (!model) return undefined
  // Minimal mapping aligned with main's unified manager
  if (cli === 'cursor') {
    if (model === 'claude-sonnet-4') return 'sonnet-4'
    if (model === 'claude-opus-4.1') return 'opus-4.1'
    return model
  }
  // claude CLI generally accepts claude-* ids; fallback to provided
  return model
}

export async function checkCLI(cli: CLIType): Promise<CLIAvailability> {
  const cmd = cli === 'claude' ? 'claude' : 'cursor-agent'
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, ['-h'], { shell: true, env: process.env })
      let out = ''
      let err = ''
      child.stdout.on('data', (d) => (out += d.toString()))
      child.stderr.on('data', (d) => (err += d.toString()))
      child.on('error', (e) => {
        resolve({ available: false, configured: false, message: `${cmd} not found. Install and login.` })
      })
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ available: true, configured: true })
        } else {
          resolve({ available: false, configured: false, message: `${cmd} returned ${code}. Please install and login.` })
        }
      })
    } catch (e: any) {
      resolve({ available: false, configured: false, message: e?.message || 'CLI check failed' })
    }
  })
}

function buildArgVariants(cli: CLIType, instruction: string, model?: string): string[][] {
  const variants: string[][] = []
  if (cli === 'claude') {
    // Try stable/simple first, then flags last
    variants.push(['chat', instruction])
    if (model) variants.push(['chat', '--model', model, instruction])
    // Some older/newer CLIs accept direct message without subcommand
    variants.push([instruction])
    if (model) variants.push(['--model', model, instruction])
    // Fallback flagged forms (may not exist on some versions)
    if (model) variants.push(['chat', '--model', model, '--message', instruction, '--stream'])
    variants.push(['chat', '--message', instruction, '--stream'])
  } else {
    // cursor-agent
    if (model) variants.push(['run', '--model', model, '--stream-json', instruction])
    variants.push(['run', '--stream-json', instruction])
    if (model) variants.push(['run', '--model', model, instruction])
    variants.push(['run', instruction])
  }
  return variants
}

export function runCLIStreaming(opts: CLIRunOptions, handlers: {
  onTextChunk: (text: string) => void
  onJsonEvent?: (obj: any) => void
  onClose: (code: number | null) => void
  onError: (error: Error) => void
}) {
  const cmd = opts.cli === 'claude' ? 'claude' : 'cursor-agent'
  const model = mapModelForCLI(opts.cli, opts.model)
  const variants = buildArgVariants(opts.cli, opts.instruction, model)

  let tried = 0
  let hadOutput = false
  const tryNext = () => {
    if (tried >= variants.length) {
      handlers.onError(new Error(`${cmd} did not accept any known arguments. Please update CLI.`))
      return
    }
    const args = variants[tried++]
    const child = spawn(cmd, args, { cwd: opts.cwd || process.cwd(), shell: true, env: process.env })
    let buffer = ''

    child.stdout.on('data', (data) => {
      const chunk = data.toString()
      buffer += chunk
      if (chunk.trim()) hadOutput = true
      // Split by newlines and parse NDJSON lines if possible
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const obj = JSON.parse(trimmed)
          handlers.onJsonEvent?.(obj)
          // Also emit text if present
          if (typeof obj === 'object') {
            if (obj.delta && typeof obj.delta === 'string') {
              handlers.onTextChunk(obj.delta)
            } else if (obj.text) {
              handlers.onTextChunk(String(obj.text))
            } else if (obj.content) {
              handlers.onTextChunk(typeof obj.content === 'string' ? obj.content : JSON.stringify(obj.content))
            }
          }
        } catch {
          handlers.onTextChunk(trimmed)
        }
      }
    })
    child.stderr.on('data', (data) => {
      const s = data.toString()
      // Some CLIs stream useful output on stderr; surface as text
      if (s && s.trim()) {
        hadOutput = true
        handlers.onTextChunk(s)
      }
    })
    child.on('error', (e) => {
      // Try next variant
      tryNext()
    })
    child.on('close', (code) => {
      // Flush remaining buffer
      if (buffer.trim()) {
        try {
          const obj = JSON.parse(buffer.trim())
          handlers.onJsonEvent?.(obj)
          if (obj && obj.text) handlers.onTextChunk(String(obj.text))
        } catch {
          handlers.onTextChunk(buffer)
        }
        buffer = ''
      }
      if ((code && code !== 0 && !hadOutput)) {
        // Likely wrong flags; try next variant
        tryNext()
      } else if (!hadOutput) {
        // No content produced; treat as error so UI doesn't silently show nothing
        handlers.onError(new Error(`${cmd} produced no output. Ensure you're logged in and try again.`))
      } else {
        handlers.onClose(code)
      }
    })
  }

  tryNext()
}
