import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { getPrisma } from '@repo/db'
import { loadSystemPrompt } from '@repo/services-projects'

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
          yield { kind: 'message', content: agentMessageBuffer, role: 'assistant', messageType: 'chat', metadata: { cli_type: 'codex' } }
          agentMessageBuffer = ''
        }
        return
      }
      if (type === 'exec_command_begin') {
        const cmd = Array.isArray(msg.command) ? msg.command.join(' ') : String(msg.command || '')
        yield { kind: 'message', content: `Using tool: exec_command ${cmd}`, role: 'assistant', messageType: 'tool_use', metadata: { tool_name: 'Bash', cli_type: 'codex' } }
        return
      }
      if (type === 'patch_apply_begin') {
        yield { kind: 'message', content: 'Applying code changes', role: 'assistant', messageType: 'tool_use', metadata: { tool_name: 'Edit', changes_made: true, cli_type: 'codex' } }
        return
      }
      if (type === 'web_search_begin') {
        yield { kind: 'message', content: `Using tool: web_search ${msg.query || ''}`, role: 'assistant', messageType: 'tool_use', metadata: { tool_name: 'WebSearch', cli_type: 'codex' } }
        return
      }
      if (type === 'mcp_tool_call_begin') {
        const inv = msg.invocation || {}
        yield { kind: 'message', content: `Using tool: ${inv.server || ''}/${inv.tool || ''}`, role: 'assistant', messageType: 'tool_use', metadata: { tool_name: 'MCPTool', cli_type: 'codex' } }
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
          yield { kind: 'message', content: summarizeTool(toolName, args), role: 'assistant', messageType: 'tool_use', metadata: { tool_name: toolName, cli_type: 'cursor', original_event: evt } }
          return
        }
        if (subtype === 'completed') {
          const result = toolCall[rawName]?.result || {}
          const content = 'success' in result ? JSON.stringify(result.success) : ('error' in result ? JSON.stringify(result.error) : '')
          yield { kind: 'message', content, role: 'system', messageType: 'tool_result', metadata: { hidden_from_ui: true, cli_type: 'cursor', original_format: evt } }
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
  if (tool === 'exec_command') {
    const cmd = Array.isArray(args.command) ? args.command.join(' ') : String(args.command || '')
    return `Using tool: exec_command ${cmd}`
  }
  if (tool === 'web_search') {
    return `Using tool: web_search ${args?.query || ''}`
  }
  return `Using tool: ${tool}`
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
  return new SimulatedAdapter(name)
}
