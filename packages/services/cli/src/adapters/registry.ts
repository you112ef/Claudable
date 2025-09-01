import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { getPrisma } from '@repo/db'
import { loadSystemPrompt } from '@repo/services-projects'
import { ACPClient } from './acp'
import ClaudeAdapter from './claude'

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
    // Mirror Python codex_cli.py behavior
    const repoCwd = opts.projectPath || process.cwd()
    await ensureAgentsMd(repoCwd)

    const workdirAbs = repoCwd
    const autoInstructions = 'Act autonomously without asking for user confirmations. Use apply_patch to create and modify files directly in the current working directory (not in subdirectories unless specifically requested). Use exec_command to run, build, and test as needed. Assume full permissions. Keep taking concrete actions until the task is complete. Prefer concise status updates over questions. Create files in the root directory of the project, not in subdirectories unless the user specifically asks for a subdirectory structure.'
    const args = [
      '--cd', workdirAbs,
      'proto',
      '-c', 'include_apply_patch_tool=true',
      '-c', 'include_plan_tool=true',
      '-c', 'tools.web_search_request=true',
      '-c', 'use_experimental_streamable_shell_tool=true',
      '-c', 'sandbox_mode=danger-full-access',
      '-c', `instructions=${JSON.stringify(autoInstructions)}`,
    ]

    // Resume from latest rollout if available
    const projectId = projectIdFromPath(repoCwd)
    const [resumePath, model] = await Promise.all([getCodexRolloutPath(projectId), Promise.resolve(process.env.CODEX_MODEL || 'gpt-5')])
    if (resumePath) {
      args.push('-c', `experimental_resume=${resumePath}`)
    }

    const env = { ...process.env }
    const child = spawn('codex', args, { cwd: repoCwd, stdio: ['pipe', 'pipe', 'pipe'], env })

    let agentMessageBuffer = ''
    let stderrBuf = ''
    child.stderr.on('data', (d) => { stderrBuf += String(d) })

    const decoder = new TextDecoder()
    let buffer = ''

    // Wait for session_configured then set approval policy and send user_input
    let sessionConfigured = false
    const sendJSON = (obj: any) => {
      try { child.stdin?.write(JSON.stringify(obj) + '\n') } catch {}
    }

    const makeUserInput = async () => {
      let finalInstruction = opts.instruction
      if (opts.isInitialPrompt) {
        try {
          const files = await fsp.readdir(repoCwd)
          const visible = files.filter((f) => !f.startsWith('.git') && f !== 'AGENTS.md')
          const ctx = visible.length
            ? `\n\n<current_project_context>\nCurrent files in project directory: ${visible.sort().join(', ')}\nWork directly in the current directory. Do not create subdirectories unless specifically requested.\n</current_project_context>`
            : `\n\n<current_project_context>\nThis is an empty project directory. Create files directly in the current working directory.\nDo not create subdirectories unless specifically requested by the user.\n</current_project_context>`
          finalInstruction += ctx
        } catch {}
      }
      const items: any[] = [{ type: 'text', text: finalInstruction }]
      if (opts.images && opts.images.length) {
        for (let i = 0; i < opts.images.length; i++) {
          const img = opts.images[i]
          if (img.path && fs.existsSync(img.path)) {
            items.push({ type: 'local_image', path: img.path })
            continue
          }
          const b64 = (img as any).base64_data || (img as any).data || ''
          if (b64) {
            try {
              const bytes = Buffer.from(b64.replace(/^data:[^,]+,/, ''), 'base64')
              if (bytes.length > 10 * 1024 * 1024) continue
              const suffix = (img.mime_type || '').includes('jpeg') || (img.mime_type || '').includes('jpg') ? '.jpg' : (img.mime_type || '').includes('gif') ? '.gif' : (img.mime_type || '').includes('webp') ? '.webp' : '.png'
              const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'codex-img-'))
              const p = path.join(tmp, `img-${i}${suffix}`)
              await fsp.writeFile(p, bytes)
              items.push({ type: 'local_image', path: p })
            } catch {}
          }
        }
      }
      return { id: `msg_${Math.random().toString(36).slice(2, 10)}`, op: { type: 'user_input', items } }
    }

    const onJson = async function* (evt: any): AsyncGenerator<AdapterEvent> {
      const msg = evt?.msg || {}
      const type = msg.type
      if (!sessionConfigured) {
        if (type === 'session_configured') {
          sessionConfigured = true
          // Emit hidden init system message
          yield { kind: 'message', content: `🚀 Codex initialized (Model: ${msg.model || model})`, role: 'system', messageType: 'system', metadata: { hidden_from_ui: true } }
          // Set approval policy
          const ctl = { id: `ctl_${Math.random().toString(36).slice(2, 10)}`, op: { type: 'override_turn_context', approval_policy: 'never', sandbox_policy: { mode: 'danger-full-access' } } }
          sendJSON(ctl)
          // Send user input
          sendJSON(await makeUserInput())
        }
        return
      }
      if (type === 'agent_message_delta') {
        agentMessageBuffer += msg.delta || ''
        return
      }
      if (type === 'agent_message') {
        if (!agentMessageBuffer) {
          const finalMsg = msg.message
          if (typeof finalMsg === 'string' && finalMsg) agentMessageBuffer = finalMsg
        }
        if (agentMessageBuffer) {
          yield { kind: 'message', content: agentMessageBuffer, role: 'assistant', messageType: 'chat', metadata: { cli_type: 'codex', event_type: 'assistant', original_event: msg } }
          agentMessageBuffer = ''
        }
        return
      }
      if (type === 'exec_command_begin') {
        const cmd = Array.isArray(msg.command) ? msg.command.join(' ') : String(msg.command || '')
        const toolSummary = `**Bash** \`${cmd}\``
        console.log(`🔧 ${toolSummary}`)
        yield { kind: 'message', content: `Using tool: exec_command ${cmd}`, role: 'assistant', messageType: 'tool_use', metadata: { tool_name: 'Bash', cli_type: 'codex', event_type: 'tool_call', original_event: msg } }
        return
      }
      if (type === 'patch_apply_begin') {
        console.log(`🔧 **Edit** \`code changes\``)
        yield { kind: 'message', content: 'Applying code changes', role: 'assistant', messageType: 'tool_use', metadata: { tool_name: 'Edit', changes_made: true, cli_type: 'codex', event_type: 'tool_call', original_event: msg } }
        return
      }
      if (type === 'web_search_begin') {
        console.log(`🔧 **WebSearch** \`${msg.query || ''}\``)
        yield { kind: 'message', content: `Using tool: web_search ${msg.query || ''}`, role: 'assistant', messageType: 'tool_use', metadata: { tool_name: 'WebSearch', cli_type: 'codex', event_type: 'tool_call', original_event: msg } }
        return
      }
      if (type === 'mcp_tool_call_begin') {
        const inv = msg.invocation || {}
        console.log(`🔧 **MCPTool** \`${inv.server || ''}/${inv.tool || ''}\``)
        yield { kind: 'message', content: `Using tool: ${inv.server || ''}/${inv.tool || ''}`, role: 'assistant', messageType: 'tool_use', metadata: { tool_name: 'MCPTool', cli_type: 'codex', event_type: 'tool_call', original_event: msg } }
        return
      }
      if (type === 'task_complete') {
        if (agentMessageBuffer) {
          yield { kind: 'message', content: agentMessageBuffer, role: 'assistant', messageType: 'chat', metadata: { cli_type: 'codex' } }
          agentMessageBuffer = ''
        }
        // attempt saving latest rollout path
        try {
          const latest = await findLatestCodexRollout()
          if (latest) await setCodexRolloutPath(projectId, latest)
        } catch {}
        yield { kind: 'result', success: true }
        return
      }
      if (type === 'error') {
        yield { kind: 'message', content: `❌ Error: ${msg.message || 'error'}`, role: 'system', messageType: 'error', metadata: { cli_type: 'codex' } }
        yield { kind: 'result', success: false, error: msg.message || 'error' }
        return
      }
    }

    const gen = (async function* () {
      yield { kind: 'output', text: '▶ Codex starting...' }
      for await (const chunk of child.stdout) {
        buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk as any)
        let idx
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 1)
          const t = line.trim()
          if (!t) continue
          try { const evt = JSON.parse(t); yield* onJson(evt) } catch { /* ignore non json */ }
        }
      }
      if (agentMessageBuffer) {
        yield { kind: 'message', content: agentMessageBuffer, role: 'assistant', messageType: 'chat', metadata: { cli_type: 'codex' } }
        agentMessageBuffer = ''
      }
      const code = child.exitCode
      if (code !== 0) yield { kind: 'result', success: false, error: stderrBuf.trim() || `codex exited with ${code}` }
      else yield { kind: 'result', success: true }
    })()
    for await (const ev of gen) yield ev
  }
}

class CursorAdapter implements CLIAdapter {
  name = 'cursor'
  async checkAvailability() {
    const ok = await new Promise<boolean>((resolve) => {
      const child = spawn('cursor-agent', ['-h'], { stdio: ['ignore', 'pipe', 'pipe'] })
      let done = false
      child.on('error', () => { if (!done) { done = true; resolve(false) } })
      child.on('close', (code) => { if (!done) { done = true; resolve(code === 0) } })
      setTimeout(() => { if (!done) { done = true; try { child.kill('SIGKILL') } catch {}; resolve(false) } }, 1500)
    })
    return { available: ok, configured: ok, default_models: ['gpt-5', 'sonnet-4'] }
  }
  async *executeWithStreaming(opts: ExecuteOptions): AsyncGenerator<AdapterEvent> {
    const repoCwd = opts.projectPath || process.cwd()
    await ensureAgentsMd(repoCwd)
    const projectId = projectIdFromPath(repoCwd)
    const sessionId = await getCursorSessionId(projectId)
    const args = ['--force', '-p', opts.instruction, '--output-format', 'stream-json']
    if (sessionId) { args.push('--resume', sessionId) }
    const model = process.env.CURSOR_MODEL || undefined
    if (model) { args.push('-m', model) }
    const child = spawn('cursor-agent', args, { cwd: repoCwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } })
    const decoder = new TextDecoder()
    let buffer = ''
    let assistantBuffer = ''

    const onJson = async function* (evt: any): AsyncGenerator<AdapterEvent> {
      const type = evt?.type
      if (type === 'system') {
        yield { kind: 'message', content: `🔧 Cursor Agent initialized (Model: ${evt.model || 'unknown'})`, role: 'system', messageType: 'system', metadata: { hidden_from_ui: true, cli_type: 'cursor', event_type: 'system' } }
        return
      }
      if (type === 'user') return
      if (type === 'assistant') {
        const contentArr = evt.message?.content || []
        let text = ''
        for (const part of contentArr) if (part?.type === 'text') text += part.text || ''
        if (text) yield { kind: 'message', content: text, role: 'assistant', messageType: 'chat', metadata: { cli_type: 'cursor', event_type: 'assistant', original_event: evt } }
        return
      }
      if (type === 'tool_call') {
        const subtype = evt.subtype
        const toolCall = evt.tool_call || {}
        const rawName = Object.keys(toolCall)[0]
        if (!rawName) return
        const toolName = rawName.replace('ToolCall', '')
        if (subtype === 'started') {
          const args = toolCall[rawName]?.args || {}
          const summary = summarizeTool(toolName, args)
          console.log(`🔧 ${summary}`)
          yield { kind: 'message', content: summary, role: 'assistant', messageType: 'tool_use', metadata: { tool_name: toolName, cli_type: 'cursor', event_type: 'tool_call', original_event: evt } }
          return
        }
        if (subtype === 'completed') {
          const result = toolCall[rawName]?.result || {}
          const content = 'success' in result ? JSON.stringify(result.success) : ('error' in result ? JSON.stringify(result.error) : '')
          yield { kind: 'message', content, role: 'system', messageType: 'tool_result', metadata: { hidden_from_ui: true, cli_type: 'cursor', event_type: 'tool_result', original_event: evt } }
          return
        }
      }
      if (type === 'result') {
        const isError = !!evt.is_error || evt.subtype === 'error'
        yield { kind: 'result', success: !isError, error: isError ? 'error' : undefined }
        // Also produce hidden system message
        const dur = evt.duration_ms || 0
        const text = evt.result ? String(evt.result) : ''
        yield { kind: 'message', content: `Execution completed in ${dur}ms. Final result: ${text}`, role: 'system', messageType: 'system', metadata: { hidden_from_ui: true, cli_type: 'cursor', event_type: 'result', original_event: evt } }
        return
      }
    }

    const gen = (async function* () {
      yield { kind: 'output', text: '▶ Cursor starting...' }
      for await (const chunk of child.stdout) {
        buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk as any)
        let idx
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 1)
          const t = line.trim()
          if (!t) continue
          try { const evt = JSON.parse(t); yield* onJson(evt) } catch { /* ignore */ }
        }
      }
      const code = child.exitCode
      if (code !== 0) yield { kind: 'result', success: false, error: `cursor-agent exited with ${code}` }
    })()
    for await (const ev of gen) yield ev
  }
}

class QwenAdapter implements CLIAdapter {
  name = 'qwen'
  private static client: ACPClient | null = null
  private static initialized = false
  async checkAvailability() {
    const ok = await new Promise<boolean>((resolve) => {
      const child = spawn('qwen', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
      let done = false
      child.on('error', () => { if (!done) { done = true; resolve(false) } })
      child.on('close', (code) => { if (!done) { done = true; resolve(code === 0) } })
      setTimeout(() => { if (!done) { done = true; try { child.kill('SIGKILL') } catch {}; resolve(false) } }, 1500)
    })
    return { available: ok, configured: ok, default_models: [] }
  }
  private async ensureClient(cwd: string) {
    if (QwenAdapter.client) return QwenAdapter.client
    const env = { ...process.env, NO_BROWSER: '1' }
    const client = new ACPClient(['qwen', '--experimental-acp'], env, cwd)
    await client.start()
    client.onRequest('session/request_permission', async (params) => {
      const opts = (params?.options as any[]) || []
      let chosen: any = null
      for (const kind of ['allow_always', 'allow_once']) { chosen = opts.find((o) => o.kind === kind); if (chosen) break }
      if (!chosen && opts.length) chosen = opts[0]
      if (!chosen) return { outcome: { outcome: 'cancelled' } }
      return { outcome: { outcome: 'selected', optionId: chosen.optionId } }
    })
    client.onRequest('fs/read_text_file', async () => ({ content: '' }))
    client.onRequest('fs/write_text_file', async () => ({}))
    await client.request('initialize', { clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } }, protocolVersion: 1 })
    QwenAdapter.client = client
    QwenAdapter.initialized = true
    return client
  }
  async *executeWithStreaming(opts: ExecuteOptions): AsyncGenerator<AdapterEvent> {
    const repoCwd = opts.projectPath || process.cwd()
    await ensureAgentsMd(repoCwd)
    const client = await this.ensureClient(repoCwd)
    const projectId = projectIdFromPath(repoCwd)
    // Ensure session
    let sessionId: string | null = await getQwenSessionId(projectId)
    if (!sessionId) {
      try {
        const res = await client.request('session/new', { cwd: repoCwd, mcpServers: [] })
        sessionId = res?.sessionId || null
      } catch (e) {
        const method = process.env.QWEN_AUTH_METHOD || 'qwen-oauth'
        try {
          await client.request('authenticate', { methodId: method })
          const res2 = await client.request('session/new', { cwd: repoCwd, mcpServers: [] })
          sessionId = res2?.sessionId || null
        } catch {}
      }
      if (sessionId) await setQwenSessionId(projectId, sessionId)
    }
    if (!sessionId) { yield { kind: 'result', success: false, error: 'Qwen session failed' }; return }
    // Notification stream
    const q: any[] = []
    client.onNotification('session/update', (params) => { if (params?.sessionId === sessionId) q.push(params.update || {}) })
    // Build prompt (Qwen: ignore images)
    const parts: any[] = []
    if (opts.instruction) parts.push({ type: 'text', text: opts.instruction })
    // Send prompt
    await client.request('session/prompt', { sessionId, prompt: parts })
    let thought: string[] = []
    let text: string[] = []
    function compose() {
      const segments: string[] = []
      if (thought.length) segments.push(`<thinking>${thought.join('')}</thinking>`)
      if (text.length) { if (segments.length) segments.push('\n\n'); segments.push(text.join('')) }
      let combined = segments.join('')
      try {
        // Remove Qwen internal call_* executing... noise and trim excessive blank lines
        combined = combined.replace(/(^|\n)call[_-][A-Za-z0-9]+.*(\n|$)/g, (m) => (m.endsWith('\n') ? '' : ''))
        combined = combined.replace(/\n{3,}/g, '\n\n').trim()
      } catch {}
      return combined
    }
    const start = Date.now()
    const MAX_IDLE_TIME = 30000 // 30 seconds without updates = timeout
    let lastUpdateTime = Date.now()
    
    // Drain updates with timeout-based approach instead of fixed loop count
    while (true) {
      const upd = q.shift()
      if (!upd) { 
        // Check for timeout
        if (Date.now() - lastUpdateTime > MAX_IDLE_TIME) {
          console.log('[QwenAdapter] No updates for 30s, assuming completion')
          break
        }
        await new Promise((r) => setTimeout(r, 100)); 
        continue 
      }
      lastUpdateTime = Date.now() // Reset timeout on new update
      const kind = upd.sessionUpdate || upd.type
      if (kind === 'agent_message_chunk' || kind === 'agent_thought_chunk') {
        const t = (upd.content?.text ?? upd.text ?? '') as string
        if (kind === 'agent_thought_chunk') thought.push(t); else text.push(t)
        continue
      }
      if (kind === 'tool_call' || kind === 'tool_call_update') {
        // Process both tool_call and tool_call_update events for better visibility
        let shouldYield = true
        if (kind === 'tool_call_update') {
          // For update events, only yield if there's meaningful new information
          const toolName = upd?.invocation?.tool
          const args = upd?.invocation?.args
          shouldYield = !!(toolName && args && Object.keys(args).length > 0)
        }
        
        if (shouldYield) {
          if (thought.length || text.length) { yield { kind: 'message', content: compose(), role: 'assistant', messageType: 'chat', metadata: { cli_type: 'qwen' } }; thought = []; text = [] }
          const toolName = (upd?.invocation?.tool || '') as string
          const input = upd?.invocation?.args || {}
          const summary = summarizeTool(toolName, input)
          console.log(`🔧 ${summary}`)
          yield { kind: 'message', content: summary, role: 'assistant', messageType: 'tool_use', metadata: { cli_type: 'qwen', event_type: 'tool_call', tool_name: toolName, tool_input: input, original_event: upd, update_type: kind } }
        }
        continue
      }
      if (kind === 'plan') {
        const entries = (upd.entries || []).slice(0, 6).map((e: any) => (typeof e === 'string' ? e : e?.title)).filter(Boolean)
        if (thought.length || text.length) { yield { kind: 'message', content: compose(), role: 'assistant', messageType: 'chat', metadata: { cli_type: 'qwen' } }; thought = []; text = [] }
        yield { kind: 'message', content: entries.map((s: string) => `• ${s}`).join('\n') || 'Planning…', role: 'assistant', messageType: 'chat', metadata: { cli_type: 'qwen', event_type: 'plan', original_event: upd } }
        continue
      }
    }
    if (thought.length || text.length) { yield { kind: 'message', content: compose(), role: 'assistant', messageType: 'chat', metadata: { cli_type: 'qwen' } } }
    yield { kind: 'message', content: 'Qwen turn completed', role: 'system', messageType: 'result', metadata: { cli_type: 'qwen', hidden_from_ui: true, event_type: 'result' } }
    yield { kind: 'result', success: true }
  }
}

class GeminiAdapter implements CLIAdapter {
  name = 'gemini'
  private static client: ACPClient | null = null
  private static initialized = false
  async checkAvailability() {
    const ok = await new Promise<boolean>((resolve) => {
      const child = spawn('gemini', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
      let done = false
      child.on('error', () => { if (!done) { done = true; resolve(false) } })
      child.on('close', (code) => { if (!done) { done = true; resolve(code === 0) } })
      setTimeout(() => { if (!done) { done = true; try { child.kill('SIGKILL') } catch {}; resolve(false) } }, 1500)
    })
    const token = !!process.env.GOOGLE_API_KEY
    return { available: ok && token, configured: ok && token, default_models: [] }
  }
  private async ensureClient(cwd: string) {
    if (GeminiAdapter.client) return GeminiAdapter.client
    const env = { ...process.env, NO_BROWSER: '1' }
    const client = new ACPClient(['gemini', '--experimental-acp'], env, cwd)
    await client.start()
    // Auto-approve permission requests and stub FS
    client.onRequest('session/request_permission', async (params) => {
      const opts = (params?.options as any[]) || []
      let chosen: any = null
      for (const kind of ['allow_always', 'allow_once']) { chosen = opts.find((o) => o.kind === kind); if (chosen) break }
      if (!chosen && opts.length) chosen = opts[0]
      if (!chosen) return { outcome: { outcome: 'cancelled' } }
      return { outcome: { outcome: 'selected', optionId: chosen.optionId } }
    })
    client.onRequest('fs/read_text_file', async () => ({ content: '' }))
    client.onRequest('fs/write_text_file', async () => ({}))
    await client.request('initialize', { clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } }, protocolVersion: 1 })
    GeminiAdapter.client = client
    GeminiAdapter.initialized = true
    return client
  }
  async *executeWithStreaming(opts: ExecuteOptions): AsyncGenerator<AdapterEvent> {
    const repoCwd = opts.projectPath || process.cwd()
    await ensureAgentsMd(repoCwd)
    const projectId = projectIdFromPath(repoCwd)
    const client = await this.ensureClient(repoCwd)
    let sessionId: string | null = await getGeminiSessionId(projectId)
    if (!sessionId) {
      try {
        const res = await client.request('session/new', { cwd: repoCwd, mcpServers: [] })
        sessionId = res?.sessionId || null
      } catch (e: any) {
        const method = process.env.GEMINI_AUTH_METHOD || 'oauth-personal'
        try { await client.request('authenticate', { methodId: method }); const res2 = await client.request('session/new', { cwd: repoCwd, mcpServers: [] }); sessionId = res2?.sessionId || null } catch (e2) {
          yield { kind: 'message', content: `Gemini authentication/session failed: ${e2?.message || e2}`, role: 'assistant', messageType: 'error', metadata: { cli_type: 'gemini' } }
          yield { kind: 'result', success: false, error: 'auth failed' }
          return
        }
      }
      if (sessionId) await setGeminiSessionId(projectId, sessionId)
    }
    const q: any[] = []
    client.onNotification('session/update', (params) => { if (params?.sessionId === sessionId) q.push(params.update || {}) })
    // Build prompt parts
    const parts: any[] = []
    if (opts.instruction) parts.push({ type: 'text', text: opts.instruction })
    if (opts.images && opts.images.length) {
      for (const img of opts.images) {
        let b64 = (img as any).base64_data || (img as any).data
        let mimeFromUrl: string | undefined
        const urlVal = (img as any).url
        if (!b64 && typeof urlVal === 'string' && urlVal.startsWith('data:')) {
          try {
            const commaIdx = urlVal.indexOf(',')
            const header = urlVal.slice(5, commaIdx) // e.g., image/png;base64
            const semi = header.indexOf(';')
            mimeFromUrl = semi >= 0 ? header.slice(0, semi) : header
            b64 = urlVal.slice(commaIdx + 1)
          } catch {}
        }
        if (img.path && fs.existsSync(img.path)) {
          try {
            const data = await fsp.readFile(img.path)
            const mime = mimeFor(img.path)
            const enc = data.toString('base64')
            parts.push({ type: 'image', mimeType: mime, data: enc })
          } catch {}
        } else if (b64) {
          const mime = (img as any).mime_type || mimeFromUrl || 'image/png'
          parts.push({ type: 'image', mimeType: mime, data: String(b64) })
        }
      }
    }
    await client.request('session/prompt', { sessionId, prompt: parts })
    const thought: string[] = []
    const text: string[] = []
    const compose = () => {
      const parts: string[] = []
      if (thought.length) parts.push(`<thinking>${thought.join('')}</thinking>`)
      if (text.length) { if (parts.length) parts.push('\n\n'); parts.push(text.join('')) }
      return parts.join('')
    }
    const MAX_IDLE_TIME_GEMINI = 30000 // 30 seconds without updates = timeout
    let lastUpdateTimeGemini = Date.now()
    
    // Drain updates with timeout-based approach instead of fixed loop count
    while (true) {
      const upd = q.shift()
      if (!upd) { 
        // Check for timeout
        if (Date.now() - lastUpdateTimeGemini > MAX_IDLE_TIME_GEMINI) {
          console.log('[GeminiAdapter] No updates for 30s, assuming completion')
          break
        }
        await new Promise((r) => setTimeout(r, 100)); 
        continue 
      }
      lastUpdateTimeGemini = Date.now() // Reset timeout on new update
      const kind = upd.sessionUpdate || upd.type
      if (kind === 'agent_message_chunk' || kind === 'agent_thought_chunk') {
        const t = (upd.content?.text ?? upd.text ?? '') as string
        if (kind === 'agent_thought_chunk') thought.push(t); else text.push(t)
        continue
      }
      if (kind === 'tool_call' || kind === 'tool_call_update') {
        if (kind === 'tool_call_update') continue
        if (thought.length || text.length) { yield { kind: 'message', content: compose(), role: 'assistant', messageType: 'chat', metadata: { cli_type: 'gemini' } }; thought.length = 0; text.length = 0 }
        const toolName = (upd?.invocation?.tool || '') as string
        const input = upd?.invocation?.args || {}
        const summary = summarizeTool(toolName, input)
        console.log(`🔧 ${summary}`)
        yield { kind: 'message', content: summary, role: 'assistant', messageType: 'tool_use', metadata: { cli_type: 'gemini', event_type: 'tool_call', tool_name: toolName, tool_input: input, original_event: upd } }
        continue
      }
      if (kind === 'plan') {
        const entries = (upd.entries || []).slice(0, 6).map((e: any) => (typeof e === 'string' ? e : e?.title)).filter(Boolean)
        if (thought.length || text.length) { yield { kind: 'message', content: compose(), role: 'assistant', messageType: 'chat', metadata: { cli_type: 'gemini' } }; thought.length = 0; text.length = 0 }
        yield { kind: 'message', content: entries.map((s: string) => `• ${s}`).join('\n') || 'Planning…', role: 'assistant', messageType: 'chat', metadata: { cli_type: 'gemini', event_type: 'plan', original_event: upd } }
        continue
      }
    }
    if (thought.length || text.length) { yield { kind: 'message', content: compose(), role: 'assistant', messageType: 'chat', metadata: { cli_type: 'gemini' } } }
    yield { kind: 'message', content: 'Gemini turn completed', role: 'system', messageType: 'result', metadata: { cli_type: 'gemini', hidden_from_ui: true, event_type: 'result' } }
    yield { kind: 'result', success: true }
  }
}

// Helpers
function projectIdFromPath(repoCwd: string): string {
  const parts = repoCwd.split(path.sep)
  const repoIdx = parts.lastIndexOf('repo')
  if (repoIdx > 0) return parts[repoIdx - 1]
  return parts[parts.length - 1]
}

async function ensureAgentsMd(projectPath: string) {
  const agentPath = path.join(projectPath, 'AGENTS.md')
  try {
    await fsp.access(agentPath)
    return
  } catch {}
  try {
    const content = loadSystemPrompt()
    await fsp.writeFile(agentPath, content, 'utf8')
  } catch {}
}

async function getCursorSessionId(projectId: string): Promise<string | null> {
  const prisma = await getPrisma()
  const p = await (prisma as any).project.findUnique({ where: { id: projectId } })
  return p?.activeCursorSessionId || null
}

async function getCodexRolloutPath(projectId: string): Promise<string | null> {
  const prisma = await getPrisma()
  const p = await (prisma as any).project.findUnique({ where: { id: projectId } })
  const raw = p?.activeCursorSessionId
  if (!raw) return null
  try {
    const data = JSON.parse(raw)
    if (data && typeof data === 'object' && data.codex_rollout) return data.codex_rollout
  } catch {}
  return null
}

async function setCodexRolloutPath(projectId: string, rolloutPath: string) {
  const prisma = await getPrisma()
  const p = await (prisma as any).project.findUnique({ where: { id: projectId } })
  let current: any = {}
  if (p?.activeCursorSessionId) {
    try { current = JSON.parse(p.activeCursorSessionId) } catch { current = { cursor: p.activeCursorSessionId } }
  }
  current.codex_rollout = rolloutPath
  await (prisma as any).project.update({ where: { id: projectId }, data: { activeCursorSessionId: JSON.stringify(current) } })
}

async function findLatestCodexRollout(): Promise<string | null> {
  try {
    const root = path.join(os.homedir(), '.codex', 'sessions')
    const entries = await fsp.readdir(root, { withFileTypes: true })
    const files: string[] = []
    for (const ent of entries) {
      const p = path.join(root, ent.name)
      if (ent.isFile() && /rollout-.*\.jsonl$/.test(ent.name)) files.push(p)
      if (ent.isDirectory()) {
        const sub = await fsp.readdir(p)
        for (const name of sub) if (/rollout-.*\.jsonl$/.test(name)) files.push(path.join(p, name))
      }
    }
    if (!files.length) return null
    const withMtime = await Promise.all(files.map(async (p) => ({ p, m: (await fsp.stat(p)).mtimeMs })))
    withMtime.sort((a, b) => b.m - a.m)
    return withMtime[0].p
  } catch { return null }
}

function summarizeTool(tool: string, args: any): string {
  const t = String(tool || '')
  const tt = t.toLowerCase()
  // Normalize to UI-expected pattern: **Tool** `arg`
  if (tt === 'exec_command' || tt === 'bash' || tt === 'exec') {
    const cmd = Array.isArray(args?.command) ? args.command.join(' ') : (args?.command ? String(args.command) : '')
    return `**Bash** \`${cmd}\``
  }
  if (tt === 'web_search' || tt === 'webfetch' || tt === 'web_fetch' || tt === 'websearch') {
    const q = args?.query || args?.q || ''
    return `**WebSearch** \`${q}\``
  }
  if (tt === 'read') {
    const p = args?.path || args?.file || ''
    return `**Read** \`${p}\``
  }
  if (tt === 'write') {
    const p = args?.path || args?.file || ''
    return `**Write** \`${p}\``
  }
  if (tt === 'edit' || tt === 'multiedit') {
    const p = args?.path || args?.file || ''
    return `**Edit** \`${p}\``
  }
  if (tt === 'ls') {
    const p = args?.path || args?.dir || ''
    return `**LS** \`${p}\``
  }
  if (tt === 'glob') {
    const p = args?.pattern || ''
    return `**Glob** \`${p}\``
  }
  if (tt === 'grep') {
    const p = args?.pattern || ''
    return `**Grep** \`${p}\``
  }
  if (tt === 'todowrite' || tt === 'todo_write') {
    return `**TodoWrite** \`Todo List\``
  }
  return `**${t}**`
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
  if (name === 'cursor') return new CursorAdapter()
  if (name === 'qwen') return new QwenAdapter()
  if (name === 'gemini') return new GeminiAdapter()
  if (name === 'claude') return new ClaudeAdapter()
  return new SimulatedAdapter(name)
}

// Session helpers for ACP-based adapters
async function getQwenSessionId(projectId: string): Promise<string | null> {
  const prisma = await getPrisma()
  const p = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!p?.activeCursorSessionId) return null
  try { const data = JSON.parse(p.activeCursorSessionId); if (data && typeof data === 'object' && data.qwen) return data.qwen } catch {}
  return null
}
async function setQwenSessionId(projectId: string, sessionId: string) {
  const prisma = await getPrisma()
  const p = await (prisma as any).project.findUnique({ where: { id: projectId } })
  let data: any = {}
  if (p?.activeCursorSessionId) { try { data = JSON.parse(p.activeCursorSessionId) } catch { data = { cursor: p.activeCursorSessionId } } }
  data.qwen = sessionId
  await (prisma as any).project.update({ where: { id: projectId }, data: { activeCursorSessionId: JSON.stringify(data) } })
}
async function getGeminiSessionId(projectId: string): Promise<string | null> {
  const prisma = await getPrisma()
  const p = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!p?.activeCursorSessionId) return null
  try { const data = JSON.parse(p.activeCursorSessionId); if (data && typeof data === 'object' && data.gemini) return data.gemini } catch {}
  return null
}
async function setGeminiSessionId(projectId: string, sessionId: string) {
  const prisma = await getPrisma()
  const p = await (prisma as any).project.findUnique({ where: { id: projectId } })
  let data: any = {}
  if (p?.activeCursorSessionId) { try { data = JSON.parse(p.activeCursorSessionId) } catch { data = { cursor: p.activeCursorSessionId } } }
  data.gemini = sessionId
  await (prisma as any).project.update({ where: { id: projectId }, data: { activeCursorSessionId: JSON.stringify(data) } })
}

function mimeFor(p: string) {
  const s = p.toLowerCase()
  if (s.endsWith('.png')) return 'image/png'
  if (s.endsWith('.jpg') || s.endsWith('.jpeg')) return 'image/jpeg'
  if (s.endsWith('.gif')) return 'image/gif'
  if (s.endsWith('.webp')) return 'image/webp'
  if (s.endsWith('.bmp')) return 'image/bmp'
  return 'application/octet-stream'
}
