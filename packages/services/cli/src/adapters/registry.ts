import { spawn } from 'node:child_process'

export type AdapterEvent =
  | { kind: 'output'; text: string }
  | { kind: 'message'; content: string; role?: 'assistant' | 'system' | 'tool'; messageType?: string; metadata?: any; parentMessageId?: string | null }
  | { kind: 'result'; success: boolean; error?: string | null; hasChanges?: boolean }

export interface ExecuteOptions {
  instruction: string
  projectPath?: string
  sessionId: string
  isInitialPrompt?: boolean
  images?: Array<{ name: string; path?: string; base64_data?: string; mime_type?: string }>
}

export interface CLIAdapter {
  name: string
  checkAvailability(): Promise<{ available: boolean; configured: boolean; error?: string; default_models?: string[] }>
  executeWithStreaming(opts: ExecuteOptions): AsyncGenerator<AdapterEvent, void, void>
}

class CodexAdapter implements CLIAdapter {
  name = 'codex'
  async checkAvailability() {
    const ok = await new Promise<boolean>((resolve) => {
      const child = spawn('codex', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
      let done = false
      child.on('error', () => { if (!done) { done = true; resolve(false) } })
      child.on('close', (code) => { if (!done) { done = true; resolve(code === 0) } })
      setTimeout(() => { if (!done) { done = true; try { child.kill('SIGKILL') } catch {}; resolve(false) } }, 1500)
    })
    return { available: ok, configured: ok, default_models: ['gpt-5'] }
  }
  async *executeWithStreaming(opts: ExecuteOptions): AsyncGenerator<AdapterEvent> {
    // Run codex in stream-json mode and parse NDJSON events
    const args = ['agent', 'stream-json']
    const child = spawn('codex', args, { cwd: opts.projectPath || process.cwd(), stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env } })
    let stderrBuf = ''
    child.stderr.on('data', (d) => { stderrBuf += String(d) })
    // Prime instruction to stdin if supported (fallback: write as plain text)
    try {
      child.stdin?.write(String(opts.instruction || '').trim() + '\n')
    } catch {}

    const decoder = new TextDecoder()
    let buffer = ''
    const onLine = async function*(line: string): AsyncGenerator<AdapterEvent> {
      const t = line.trim()
      if (!t) return
      try {
        const evt = JSON.parse(t)
        // Normalize known event shapes
        const type = evt.type || evt.event || ''
        if (type === 'message' || type === 'chat' || evt.role === 'assistant') {
          const content = evt.content || evt.text || evt.message || ''
          yield { kind: 'message', content, role: 'assistant', messageType: 'chat', metadata: evt }
        } else if (type === 'tool_result' || type === 'tool' || type === 'log') {
          const text = evt.summary || evt.text || JSON.stringify(evt)
          yield { kind: 'output', text }
        } else if (type === 'result' || type === 'done' || type === 'complete') {
          const success = evt.success !== false && evt.status !== 'error'
          yield { kind: 'result', success, error: evt.error || null }
        } else if (type === 'error') {
          yield { kind: 'message', content: String(evt.error || evt.message || 'Error'), role: 'system', messageType: 'error', metadata: evt }
          yield { kind: 'result', success: false, error: String(evt.error || 'error') }
        } else {
          // Unknown JSON event -> surface as output
          yield { kind: 'output', text: t }
        }
      } catch {
        // Not JSON -> emit as raw output
        yield { kind: 'output', text: t }
      }
    }

    const stream = child.stdout
    const reader = stream
    const self = this
    const gen = (async function* () {
      yield { kind: 'output', text: '▶ CODEX starting...' }
      for await (const chunk of reader) {
        buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk as any)
        let idx
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 1)
          yield* onLine(line)
        }
      }
      // Flush any remaining buffer
      if (buffer.trim()) yield* onLine(buffer)
      const code = child.exitCode
      if (code !== 0) {
        yield { kind: 'result', success: false, error: stderrBuf.trim() || `codex exited with ${code}` }
      } else {
        yield { kind: 'result', success: true }
      }
    })()
    // yield* the inner generator
    for await (const ev of gen) yield ev
  }
}

class SimulatedAdapter implements CLIAdapter {
  name: string
  constructor(name: string) { this.name = name }
  async checkAvailability() {
    // env-token check for SDK-based CLIs, binary check for others (best-effort)
    if (this.name === 'claude') {
      const ok = !!process.env.ANTHROPIC_API_KEY
      return { available: ok, configured: ok, default_models: ['claude-sonnet-4', 'claude-opus-4'] }
    }
    if (this.name === 'gemini') {
      const ok = !!process.env.GOOGLE_API_KEY
      return { available: ok, configured: ok, default_models: ['gemini-2.5-pro', 'gemini-2.5-flash'] }
    }
    const bin = this.name
    const installed = await new Promise<boolean>((resolve) => {
      const child = spawn(bin, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
      let done = false
      child.on('error', () => { if (!done) { done = true; resolve(false) } })
      child.on('close', (code) => { if (!done) { done = true; resolve(code === 0) } })
      setTimeout(() => { if (!done) { done = true; try { child.kill('SIGKILL') } catch {}; resolve(false) } }, 1000)
    })
    return { available: installed, configured: installed }
  }
  async *executeWithStreaming(opts: ExecuteOptions): AsyncGenerator<AdapterEvent> {
    const title = this.name.toUpperCase()
    yield { kind: 'output', text: `▶ ${title} starting...` }
    yield { kind: 'output', text: `ℹ Instruction: ${opts.instruction.slice(0, 140)}` }
    if (opts.isInitialPrompt) yield { kind: 'output', text: `ℹ Initial prompt mode` }
    if (opts.images && opts.images.length) yield { kind: 'output', text: `ℹ ${opts.images.length} image(s) attached` }

    // Emit a small assistant chat response; UI merges frequent chat chunks
    yield { kind: 'message', content: `Working on: ${opts.instruction}`, role: 'assistant', messageType: 'chat' }
    yield { kind: 'message', content: `Using ${this.name} adapter (simulated)`, role: 'assistant', messageType: 'chat', metadata: { hidden_from_ui: false } }

    yield { kind: 'output', text: `⏳ Processing...` }
    await new Promise((r) => setTimeout(r, 250))
    yield { kind: 'output', text: `✅ ${title} finished.` }
    // For simulation, mark success true and no file changes detection
    yield { kind: 'result', success: true }
  }
}

export function getAdapter(cliType: string): CLIAdapter {
  // For now, map known aliases to simulated adapters. This keeps streaming path intact.
  const name = (cliType || 'claude').toLowerCase()
  if (name === 'codex') return new CodexAdapter()
  return new SimulatedAdapter(name)
}
