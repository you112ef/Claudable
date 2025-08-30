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
  return new SimulatedAdapter(name)
}

