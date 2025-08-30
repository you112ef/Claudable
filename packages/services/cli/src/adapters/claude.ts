import { loadSystemPrompt } from '@repo/services-projects'

export type ClaudeEvent = any

export class ClaudeAdapter {
  name = 'claude'

  async checkAvailability() {
    const token = !!process.env.ANTHROPIC_API_KEY
    // Best-effort CLI check
    let cli = false
    try {
      const { spawn } = await import('node:child_process')
      cli = await new Promise<boolean>((resolve) => {
        const child = spawn('claude', ['-h'], { stdio: ['ignore', 'pipe', 'pipe'] })
        let done = false
        child.on('error', () => { if (!done) { done = true; resolve(false) } })
        child.on('close', (code) => { if (!done) { done = true; resolve(code === 0) } })
        setTimeout(() => { if (!done) { done = true; try { child.kill('SIGKILL') } catch {}; resolve(false) } }, 1000)
      })
    } catch {}
    return { available: token || cli, configured: token || cli, default_models: ['claude-sonnet-4', 'claude-opus-4.1'] }
  }

  async *executeWithStreaming(opts: {
    instruction: string
    projectPath?: string
    sessionId: string
    isInitialPrompt?: boolean
    images?: Array<{ name: string; path?: string; base64_data?: string; mime_type?: string }>
    model?: string
  }): AsyncGenerator<{ kind: 'message' | 'output' | 'result'; [k: string]: any }> {
    const systemPrompt = loadSystemPrompt()
    const model = process.env.CLAUDE_CODE_MODEL || opts.model || 'claude-sonnet-4-20250514'
    // Allowed tools per Python adapter
    const allowedToolsInitial = ['Read', 'Write', 'Edit', 'MultiEdit', 'Bash', 'Glob', 'Grep', 'LS', 'WebFetch', 'WebSearch']
    const allowedToolsNormal = [...allowedToolsInitial, 'TodoWrite']
    const disallowed = opts.isInitialPrompt ? ['TodoWrite'] : []

    // Attempt TS SDK first
    let SDK: any = null
    try {
      try { SDK = await import('@anthropic-ai/claude-code') } catch { SDK = await import('claude-code-sdk') }
    } catch {}

    if (SDK) {
      const OptionsCtor = SDK.ClaudeCodeOptions || SDK.ClaudeCodeClient?.Options || SDK.ClaudeCode?.Options
      const ClientCtor = SDK.ClaudeSDKClient || SDK.ClaudeCodeClient || SDK.ClaudeCode
      if (!ClientCtor) {
        yield { kind: 'result', success: false, error: 'Claude SDK module missing Client export' }
        return
      }
      const options = new (OptionsCtor || Object)({
        system_prompt: systemPrompt,
        allowed_tools: opts.isInitialPrompt ? allowedToolsInitial : allowedToolsNormal,
        disallowed_tools: disallowed.length ? disallowed : undefined,
        permission_mode: 'bypassPermissions',
        model,
        continue_conversation: true,
      })
      let client: any
      try {
        client = await (async () => {
          if (ClientCtor.prototype && ClientCtor.prototype.receive_messages) {
            // SDK-style
            const inst = new ClientCtor({ options })
            return inst
          }
          // Fallback assume constructor(options)
          return new ClientCtor(options)
        })()
      } catch (e: any) {
        yield { kind: 'result', success: false, error: e?.message || 'Claude SDK init failed' }
        return
      }
      try {
        if (client.query) await client.query(opts.instruction)
        // Hidden init
        yield { kind: 'message', content: `Claude Code SDK initialized (Model: ${model})`, role: 'system', messageType: 'system', metadata: { cli_type: 'claude', mode: 'SDK', hidden_from_ui: true } }
        // Stream messages
        const stream = client.receive_messages ? client.receive_messages() : client.stream?.()
        if (!stream || !stream[Symbol.asyncIterator]) {
          yield { kind: 'result', success: false, error: 'Claude SDK has no async stream' }
          return
        }
        let buffer = ''
        for await (const obj of stream) {
          const t = String(obj?.type || obj?.kind || '')
          if (t.toLowerCase().includes('assistant')) {
            // Attempt to collect text blocks
            let content = ''
            const blocks = Array.isArray(obj?.content) ? obj.content : []
            for (const block of blocks) {
              if (typeof block?.text === 'string') content += block.text
              if (block?.type === 'text' && block?.text) content += block.text
            }
            if (content) yield { kind: 'message', content, role: 'assistant', messageType: 'chat', metadata: { cli_type: 'claude', mode: 'SDK' } }
          } else if (t.toLowerCase() === 'result' || t.toLowerCase().includes('complete')) {
            yield { kind: 'message', content: `Session completed`, role: 'system', messageType: 'result', metadata: { cli_type: 'claude', hidden_from_ui: true } }
            yield { kind: 'result', success: !obj?.is_error }
            break
          } else if (t.toLowerCase().includes('system')) {
            // ignore additional system noise
          } else {
            // Tool events are SDK-specific; surface minimal output
            if (obj?.name || obj?.tool || obj?.tool_name) {
              yield { kind: 'message', content: `Using tool: ${obj?.name || obj?.tool || obj?.tool_name}`, role: 'assistant', messageType: 'tool_use', metadata: { cli_type: 'claude' } }
            }
          }
        }
      } catch (e: any) {
        yield { kind: 'message', content: `❌ Claude error: ${e?.message || e}`, role: 'system', messageType: 'error', metadata: { cli_type: 'claude' } }
        yield { kind: 'result', success: false, error: e?.message || String(e) }
      } finally {
        try { if (client?.close) await client.close() } catch {}
      }
      return
    }

    // SDK unavailable: emit failure for accuracy (user can install @anthropic-ai/claude-code)
    yield { kind: 'message', content: 'Claude SDK not available. Please install @anthropic-ai/claude-code and set ANTHROPIC_API_KEY.', role: 'system', messageType: 'error', metadata: { cli_type: 'claude' } }
    yield { kind: 'result', success: false, error: 'Claude SDK not available' }
  }
}

export default ClaudeAdapter

