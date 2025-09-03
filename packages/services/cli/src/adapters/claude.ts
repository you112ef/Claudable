import { loadSystemPrompt } from '@repo/services-projects'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { getPrisma } from '@repo/db'

// Helper function for tool summaries (align with Python BaseCLI mapping)
function summarizeTool(tool: string, args: any): string {
  const t = String(tool || '')
  const tt = t.toLowerCase()

  // Normalize tool names like FastAPI BaseCLI
  const normalize = (name: string) => {
    const key = name.toLowerCase()
    const map: Record<string, string> = {
      // File ops
      'read': 'Read', 'read_file': 'Read', 'readfile': 'Read', 'readmanyfiles': 'Read',
      'write': 'Write', 'write_file': 'Write', 'writefile': 'Write',
      'edit': 'Edit', 'edit_file': 'Edit', 'replace': 'Edit', 'multiedit': 'MultiEdit',
      'delete': 'Delete',
      'ls': 'LS', 'list_directory': 'LS', 'list_dir': 'LS', 'readfolder': 'LS',
      'grep': 'Grep', 'search_file_content': 'Grep', 'codebase_search': 'Grep', 'search': 'Grep',
      'glob': 'Glob', 'find_files': 'Glob',
      // Shell
      'exec_command': 'Bash', 'bash': 'Bash', 'exec': 'Bash', 'run_terminal_command': 'Bash', 'shell': 'Bash',
      // Web
      'web_search': 'WebSearch', 'websearch': 'WebSearch', 'google_web_search': 'WebSearch',
      'web_fetch': 'WebFetch', 'webfetch': 'WebFetch', 'fetch': 'WebFetch',
      // Planning/Memory
      'todowrite': 'TodoWrite', 'todo_write': 'TodoWrite', 'save_memory': 'SaveMemory', 'savememory': 'SaveMemory',
      // MCP
      'mcp_tool_call': 'MCPTool'
    }
    return map[key] || name
  }

  const name = normalize(t)

  const getPath = () => (args?.file_path || args?.path || args?.file || args?.directory || '') as string
  const getCmd = () => Array.isArray(args?.command) ? args.command.join(' ') : (args?.command ? String(args.command) : '')
  const getPattern = () => (args?.pattern || args?.globPattern || args?.name || '') as string
  const getQuery = () => (args?.query || args?.q || '') as string
  const getUrl = () => (args?.url || '') as string

  if (name === 'Bash') return `**Bash** \`${getCmd()}\``
  if (name === 'Read') return `**Read** \`${getPath()}\``
  if (name === 'Write') return `**Write** \`${getPath()}\``
  if (name === 'Edit' || name === 'MultiEdit') return `**Edit** \`${getPath()}\``
  if (name === 'Delete') return `**Delete** \`${getPath()}\``
  if (name === 'LS') return `**LS** \`${getPath()}\``
  if (name === 'Glob') return `**Glob** \`${getPattern()}\``
  if (name === 'Grep') return `**Grep** \`${getPattern()}\``
  if (name === 'WebSearch') return `**WebSearch** \`${getQuery()}\``
  if (name === 'WebFetch') return `**WebFetch** \`${getUrl()}\``
  if (name === 'TodoWrite') return '`Planning for next moves...`'

  return `**${name}**`
}

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
      // Claude Code parity: do NOT attach image blocks. Instead, append image path refs to text.
      if (opts.images && opts.images.length) {
        const refs: string[] = []
        for (let i = 0; i < opts.images.length; i++) {
          const img: any = opts.images[i]
          const p = img?.path as string | undefined
          const n = img?.name as string | undefined
          if (p && typeof p === 'string') refs.push(`Image #${i + 1} path: ${p}`)
          else if (n && typeof n === 'string') refs.push(`Image #${i + 1} path: ${n}`)
        }
        if (refs.length) text += `\n\n${refs.join('\n')}`
      }
      parts.push({ type: 'text', text })
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
                console.log(`🔧 ${summary}`)
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
