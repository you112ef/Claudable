import { loadSystemPrompt } from '@repo/services-projects'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { getPrisma } from '@repo/db'

type SDKMessage = any

export class ClaudeAdapter {
  name = 'claude'

  async checkAvailability() {
    const token = !!process.env.ANTHROPIC_API_KEY
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
    images?: Array<{ name: string; path?: string; base64_data?: string; mime_type?: string; url?: string }>
    model?: string
  }): AsyncGenerator<{ kind: 'message' | 'output' | 'result'; [k: string]: any }> {
    // Import SDK query api
    let queryFn: any
    try {
      const mod = await import('@anthropic-ai/claude-code')
      queryFn = mod.query
    } catch (e) {
      yield { kind: 'message', content: 'Claude SDK (@anthropic-ai/claude-code) not installed', role: 'system', messageType: 'error', metadata: { cli_type: 'claude' } }
      yield { kind: 'result', success: false, error: 'Claude SDK not available' }
      return
    }

    const repoCwd = opts.projectPath || process.cwd()
    const systemPrompt = loadSystemPrompt()
    const model = process.env.CLAUDE_CODE_MODEL || opts.model
    const allowedToolsInitial = ['Bash', 'Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'LS', 'WebFetch', 'WebSearch']
    const allowedTools = opts.isInitialPrompt ? allowedToolsInitial : [...allowedToolsInitial, 'TodoWrite']
    const disallowedTools = opts.isInitialPrompt ? ['TodoWrite'] : undefined

    // Resume session if stored
    const prisma = await getPrisma()
    const projectId = projectIdFromPath(repoCwd)
    const p = await (prisma as any).project.findUnique({ where: { id: projectId } })
    const resumeSession = p?.activeClaudeSessionId || undefined

    // Build prompt: streaming input if images, else direct string
    const buildUserContent = async () => {
      const parts: any[] = []
      let text = opts.instruction
      if (opts.isInitialPrompt) {
        // Append static initial project structure (mirroring Python behavior)
        const initCtx = '\n<initial_context>\n## Project Directory Structure (node_modules are already installed)\n.eslintrc.json\n.gitignore\nnext.config.mjs\nnext-env.d.ts\npackage.json\npostcss.config.mjs\nREADME.md\ntailwind.config.ts\ntsconfig.json\n.env\nsrc/app/favicon.ico\nsrc/app/globals.css\nsrc/app/layout.tsx\nsrc/app/page.tsx\npublic/\nnode_modules/\n</initial_context>'
        text += initCtx
      }
      parts.push({ type: 'text', text })
      if (opts.images && opts.images.length) {
        for (const img of opts.images) {
          let b64 = (img.base64_data || '') as string
          if (!b64 && img.url && img.url.startsWith('data:')) {
            try { b64 = img.url.split(',', 1)[1] || '' } catch {}
          }
          if (!b64 && img.path) {
            try { const data = await fsp.readFile(img.path); b64 = data.toString('base64') } catch {}
          }
          if (b64) {
            parts.push({ type: 'image', source: { type: 'base64', media_type: img.mime_type || 'image/png', data: b64 } })
          }
        }
      }
      return parts
    }

    const promptIterable = (async function* () {
      const content = await buildUserContent()
      yield { type: 'user' as const, message: { role: 'user' as const, content } }
    })()

    // Create AbortController per query
    const abortController = new AbortController()
    const options: any = {
      cwd: repoCwd,
      customSystemPrompt: systemPrompt,
      permissionMode: 'bypassPermissions',
      allowedTools,
      disallowedTools,
      model,
      continue: !resumeSession,
      resume: resumeSession,
      maxTurns: undefined,
    }

    // Stream messages
    try {
      for await (const message of queryFn({ prompt: promptIterable, abortController, options })) {
        const t = message?.type
        if (t === 'system' && message?.subtype === 'init') {
          const sid = message?.session_id
          if (sid) {
            try { await (prisma as any).project.update({ where: { id: projectId }, data: { activeClaudeSessionId: sid } }) } catch {}
          }
          yield { kind: 'message', content: `Claude initialized (Model: ${message?.model || model || ''})`, role: 'system', messageType: 'system', metadata: { cli_type: 'claude', hidden_from_ui: true, event_type: 'system', session_id: sid } }
          continue
        }
        if (t === 'assistant') {
          // Flatten assistant text and surface tool_use blocks as tool messages
          let content = ''
          try {
            const blocks = Array.isArray(message?.message?.content) ? message.message.content : []
            for (const block of blocks) {
              if (block?.type === 'text' && typeof block?.text === 'string') {
                content += block.text
              } else if (block?.type === 'tool_use') {
                const toolName = block?.name || block?.tool || 'Tool'
                const toolInput = block?.input || {}
                const summary = summarizeTool(toolName, toolInput)
                yield { kind: 'message', content: summary, role: 'assistant', messageType: 'tool_use', metadata: { cli_type: 'claude', event_type: 'tool_call', tool_name: toolName, tool_input: toolInput, original_event: block } }
              }
            }
          } catch {}
          if (content) yield { kind: 'message', content, role: 'assistant', messageType: 'chat', metadata: { cli_type: 'claude', mode: 'SDK', event_type: 'assistant', original_event: message?.message } }
          continue
        }
        if (t === 'result') {
          const isError = !!message?.is_error || (message?.subtype && String(message.subtype).startsWith('error'))
          // Hidden result system message with metrics
          yield { kind: 'message', content: `Session completed in ${message?.duration_ms ?? 0}ms`, role: 'system', messageType: 'result', metadata: { cli_type: 'claude', hidden_from_ui: true, event_type: 'result', duration_ms: message?.duration_ms, duration_api_ms: message?.duration_api_ms, total_cost_usd: message?.total_cost_usd, num_turns: message?.num_turns } }
          yield { kind: 'result', success: !isError, error: isError ? 'error' : undefined }
          continue
        }
        // Surface other messages minimally
      }
    } catch (e: any) {
      yield { kind: 'message', content: `Claude SDK error: ${e?.message || e}`, role: 'system', messageType: 'error', metadata: { cli_type: 'claude' } }
      yield { kind: 'result', success: false, error: e?.message || String(e) }
    }
  }
}

function projectIdFromPath(repoCwd: string): string {
  const parts = repoCwd.split(path.sep)
  const repoIdx = parts.lastIndexOf('repo')
  if (repoIdx > 0) return parts[repoIdx - 1]
  return parts[parts.length - 1]
}

export default ClaudeAdapter

function summarizeTool(tool: string, args: any): string {
  const t = String(tool || '')
  const tt = t.toLowerCase()
  if (tt === 'bash' || tt === 'exec' || tt === 'exec_command') {
    const cmd = Array.isArray(args?.command) ? args.command.join(' ') : (args?.command ? String(args.command) : '')
    return `**Bash** \`${cmd}\``
  }
  if (tt === 'websearch' || tt === 'web_search' || tt === 'webfetch' || tt === 'web_fetch') {
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
