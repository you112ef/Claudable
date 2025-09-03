import { z } from 'zod'
// Raise process listener cap to avoid noisy warnings from underlying SDKs
try {
  const cur = (process as any).getMaxListeners?.() ?? 10
  if (typeof (process as any).setMaxListeners === 'function' && cur < 50) {
    ;(process as any).setMaxListeners(50)
  }
} catch {}
import { getPrisma } from '@repo/db'
import { startPreview, getStatus } from '@repo/services/preview-runtime'
import { publish, wsRegistry } from '@repo/ws'
import { commitAll, hasChanges } from '@repo/services-git'
import { ensureDependenciesBackground } from '@repo/services-preview-runtime'
import { getAdapter } from './adapters/registry'
import { ensureGeminiMd, ensureQwenMd, ensureClaudeConfig } from './provider-docs'
import { createLogger } from '@repo/logging'

const toolLogger = createLogger('tool')
const shouldLogTools = (() => {
  const v = (process.env.LOG_TOOL_CALLS || '').toLowerCase()
  // Default ON. Allow explicit opt-out via 0/false.
  if (v === '0' || v === 'false') return false
  return true
})()
export { getCliStatusSingle, getAllCliStatus } from './status'
export { mapUnifiedModel, defaultModel, supportedUnifiedModels } from './model-mapping'

export const ActRequestSchema = z.object({
  instruction: z.string().min(1),
  conversation_id: z.string().nullable().optional(),
  cli_preference: z.string().nullable().optional(),
  fallback_enabled: z.boolean().optional().default(true),
  images: z
    .array(
      z.object({
        name: z.string().min(1),
        base64_data: z.string().optional(),
        path: z.string().optional(),
        mime_type: z.string().optional(),
      })
    )
    .optional(),
  is_initial_prompt: z.boolean().optional(),
  request_id: z.string().optional(),
})

export type ActRequest = z.infer<typeof ActRequestSchema>

type ExecResult = { success: boolean; error?: string | null; assistantMessage?: string | null; changesDetected?: boolean }

// StreamMux buffers assistant chat chunks and emits WS deltas instantly.
// It writes to DB only on commit to reduce insert load and align with FastAPI behavior.
class StreamMux {
  private projectId: string
  private conversationId: string
  private sessionId: string
  private streamId: string
  private prisma: any
  private cliSource: string
  private buffer = ''
  private seq = 0
  private enablePeriodicCommits = false
  private commitIntervalMs = 1500
  private lastCommitAt = 0
  private pendingTimer: NodeJS.Timeout | null = null

  constructor(opts: { projectId: string; conversationId: string; sessionId: string; streamId: string; prisma: any; cliSource: string }) {
    this.projectId = opts.projectId
    this.conversationId = opts.conversationId
    this.sessionId = opts.sessionId
    this.streamId = opts.streamId
    this.prisma = opts.prisma
    this.cliSource = opts.cliSource
    // Enable periodic commits for high-frequency streamers
    const t = (this.cliSource || '').toLowerCase()
    this.enablePeriodicCommits = (t === 'qwen' || t === 'gemini')
    const envVal = parseInt(process.env.STREAM_COMMIT_INTERVAL_MS || '', 10)
    if (!isNaN(envVal) && envVal > 0) this.commitIntervalMs = envVal
  }

  addDelta(delta: string) {
    if (!delta) return
    this.buffer += delta
    const seq = ++this.seq
    if (process.env.LOG_WS_DEBUG === '1') {
      try { console.log(`[WS][delta] proj=${this.projectId.slice(-8)} stream=${this.streamId.slice(0,8)} seq=${seq} len=${delta.length}`) } catch {}
    }
    publish(this.projectId, { type: 'message_delta', data: { stream_id: this.streamId, seq, role: 'assistant', message_type: 'chat', content_delta: delta }, timestamp: new Date().toISOString() } as any)
    if (this.enablePeriodicCommits) this.maybeScheduleCommit()
  }

  hasBuffered() { return this.buffer.length > 0 }

  async commit(): Promise<void> {
    if (!this.buffer) return
    const m = await appendMessage(this.prisma as any, this.projectId, 'assistant', this.buffer, this.conversationId, this.sessionId, { messageType: 'chat', cliSource: this.cliSource })
    if (process.env.LOG_WS_DEBUG === '1') {
      try { console.log(`[WS][commit] proj=${this.projectId.slice(-8)} stream=${this.streamId.slice(0,8)} msg=${m.id.slice(0,8)} len=${m.content?.length || 0}`) } catch {}
    }
    publish(this.projectId, { type: 'message_commit', data: { stream_id: this.streamId, message_id: m.id, created_at: m.createdAt, role: m.role, message_type: m.messageType ?? null, content_full: m.content, conversation_id: m.conversationId ?? null, session_id: m.sessionId ?? null }, timestamp: new Date().toISOString() } as any)
    this.buffer = ''
    this.lastCommitAt = Date.now()
  }

  private maybeScheduleCommit() {
    const now = Date.now()
    const elapsed = now - this.lastCommitAt
    if (elapsed >= this.commitIntervalMs) {
      // Fire-and-forget commit; errors are handled upstream
      void this.commit().catch(() => {})
      return
    }
    if (this.pendingTimer) return
    const wait = Math.max(50, this.commitIntervalMs - elapsed)
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null
      void this.commit().catch(() => {})
    }, wait)
  }
}

async function createSession(prisma: any, projectId: string, cliType: string, instruction?: string | null) {
  const id = (globalThis as any).crypto?.randomUUID?.() || require('node:crypto').randomUUID()
  const row = await prisma.session.create({
    data: {
      id,
      projectId,
      status: 'active',
      model: null,
      cliType,
      instruction: instruction ?? null,
      startedAt: new Date(),
    },
  })
  return row
}

async function completeSession(prisma: any, sessionId: string, success: boolean) {
  await prisma.session.update({ where: { id: sessionId }, data: { status: success ? 'completed' : 'failed', completedAt: new Date() } })
}

async function appendMessage(prisma: any, projectId: string, role: string, content: string, conversationId?: string | null, sessionId?: string | null, opts?: { messageType?: string; metadata?: any; parentMessageId?: string | null; cliSource?: string | null }) {
  const id = (globalThis as any).crypto?.randomUUID?.() || require('node:crypto').randomUUID()
  
  // Create message with immediate flush to ensure DB consistency
  const message = await prisma.message.create({ 
    data: { 
      id, 
      projectId, 
      role, 
      content, 
      conversationId: conversationId ?? null, 
      sessionId: sessionId ?? null, 
      messageType: opts?.messageType ?? null, 
      metadataJson: opts?.metadata ? JSON.stringify(opts.metadata) : null, 
      parentMessageId: opts?.parentMessageId ?? null, 
      cliSource: opts?.cliSource ?? null 
    } 
  })
  
  return message
}

async function runAdapter(_: { projectId: string; instruction: string; cliType: string; mode: 'act' | 'chat'; projectRepo: string | null; conversationId: string; sessionId: string; isInitial?: boolean; images?: any[]; streamId: string }): Promise<ExecResult> {
  const adapter = getAdapter(_.cliType)
  // Attach simple streaming to WS as cli_output and persist assistant messages
  const prisma = await getPrisma()
  let lastAssistantMessageId: string | null = null
  let changesDetected = false
  const mux = new StreamMux({ projectId: _.projectId, conversationId: _.conversationId, sessionId: _.sessionId, streamId: _.streamId, prisma, cliSource: _.cliType })
  try {
    for await (const ev of adapter.executeWithStreaming({
      instruction: _.instruction,
      projectPath: _.projectRepo || undefined,
      sessionId: _.sessionId,
      isInitialPrompt: !!_.isInitial,
      images: _.images || [],
    })) {
      if (ev.kind === 'output') {
        publish(_.projectId, { type: 'cli_output', output: ev.text, cli_type: _.cliType } as any)
      } else if (ev.kind === 'message') {
        // Centralized tool-call logging (concise one-liner)
        if (shouldLogTools && (ev.messageType === 'tool_use')) {
          try {
            const meta = ev.metadata || {}
            const toolName = meta.tool_name || (() => {
              try { const m = String(ev.content || '').match(/\*\*([^*]+)\*\*/) ; return m ? m[1] : undefined } catch { return undefined }
            })() || 'Tool'
            const input = meta.tool_input || {}
            // Try to surface a key argument for quick scanning
            const keyArg = (input.file_path || input.path || input.file || input.command || input.query || input.url || input.pattern)
            const preview = keyArg ? String(Array.isArray(keyArg) ? keyArg.join(' ') : keyArg) : ''
            const pv = preview ? ` ${preview}` : ''
            const sess = _.sessionId.slice(0, 8)
            toolLogger.info(`🔧 ${toolName}${pv} (cli=${_.cliType}, proj=${_.projectId.slice(-8)}, sess=${sess})`)
          } catch {}
        }
        const role = (ev.role || 'assistant') as string
        const isAssistantChat = role === 'assistant' && (!ev.messageType || ev.messageType === 'chat')
        if (isAssistantChat) {
          mux.addDelta(ev.content || '')
        } else {
          if (mux.hasBuffered()) { await mux.commit() }
          const m = await appendMessage(prisma as any, _.projectId, role as any, ev.content || '', _.conversationId, _.sessionId, { messageType: ev.messageType || 'chat', metadata: ev.metadata || null, parentMessageId: ev.parentMessageId || null, cliSource: _.cliType })
          lastAssistantMessageId = m.id
          await new Promise(resolve => setTimeout(resolve, 10))
          publish(_.projectId, { type: 'message', data: { id: m.id, role: m.role, message_type: m.messageType ?? null, content: m.content, metadata_json: ev.metadata || null, parent_message_id: m.parentMessageId ?? null, session_id: m.sessionId ?? null, conversation_id: m.conversationId ?? null, cli_source: m.cliSource ?? null, created_at: m.createdAt }, timestamp: new Date().toISOString() } as any)
          if (ev.metadata && ev.metadata.changes_made) changesDetected = true
        }
      } else if (ev.kind === 'result') {
        if (mux.hasBuffered()) { await mux.commit() }
        return { success: !!ev.success, error: ev.error || null, assistantMessage: null, changesDetected }
      }
    }
    // Fallback in case adapter finished without explicit result
    if (mux.hasBuffered()) { await mux.commit() }
    return { success: true, assistantMessage: null, changesDetected }
  } catch (e: any) {
    try { if (mux.hasBuffered()) { await mux.commit() } } catch {}
    return { success: false, error: e?.message || String(e), assistantMessage: null, changesDetected }
  }
}

export async function executeInstruction(projectId: string, req: ActRequest, mode: 'act' | 'chat') {
  const prisma = await getPrisma()
  const project = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!project) throw new Error('Project not found')
  const cliType: string = (req.cli_preference ?? project.preferredCli ?? 'claude') as string
  
  // Tool call logging (one-line format like FastAPI)
  console.log(`🔧 ${mode.toUpperCase()} ${projectId.slice(-8)} "${req.instruction.slice(0, 50)}${req.instruction.length > 50 ? '...' : ''}" (${cliType}${req.is_initial_prompt ? ' initial' : ''})`)
  // Before first message, ensure provider-specific prompt docs exist at repo root
  if (req.is_initial_prompt && project.repoPath) {
    try {
      const repoRoot = project.repoPath as string
      const t = (cliType || '').toLowerCase()
      if (t === 'gemini') await ensureGeminiMd(repoRoot)
      if (t === 'qwen') await ensureQwenMd(repoRoot)
      if (t === 'claude') await ensureClaudeConfig(repoRoot)
    } catch {}
  }
  const session = await createSession(prisma as any, projectId, cliType, req.instruction)
  const conversationId = req.conversation_id ?? ((globalThis as any).crypto?.randomUUID?.() || require('node:crypto').randomUUID())

  // Generate stream id for assistant chat stream and broadcast start (include stream_id)
  const streamId = ((globalThis as any).crypto?.randomUUID?.() || require('node:crypto').randomUUID())
  publish(projectId, (
    mode === 'chat'
      ? { type: 'chat_start', data: { session_id: session.id, instruction: req.instruction, request_id: req.request_id || null, stream_id: streamId } }
      : { type: 'act_start', data: { session_id: session.id, instruction: req.instruction, request_id: req.request_id || null, stream_id: streamId } }
  ) as any)

  // Build user message content with image path references (FastAPI parity)
  const images = Array.isArray(req.images) ? req.images : []
  const imagePaths: string[] = []
  const attachments: Array<{ name: string; url: string }> = []
  try {
    for (let i = 0; i < images.length; i++) {
      const img: any = images[i] || {}
      const p: string | undefined = img.path
      const n: string | undefined = img.name
      if (p) {
        imagePaths.push(p)
        try {
          const filename = (p.split('/').pop() || '').trim()
          if (filename) attachments.push({ name: n || filename, url: `/api/assets/${projectId}/${filename}` })
        } catch {}
      } else if (n) {
        imagePaths.push(n)
      }
    }
  } catch {}

  let userContent = req.instruction
  if (imagePaths.length) {
    const refs = imagePaths.map((p, idx) => `Image #${idx + 1} path: ${p}`).join('\n')
    userContent = `${req.instruction}\n\n${refs}`
  }

  const userMeta: any = {
    type: mode === 'act' ? 'act_instruction' : 'chat_instruction',
    cli_preference: cliType,
    fallback_enabled: !!req.fallback_enabled,
    has_images: imagePaths.length > 0,
    image_paths: imagePaths,
  }
  if (attachments.length) userMeta.attachments = attachments
  if (req.is_initial_prompt) userMeta.is_initial_prompt = true

  // Append user message (with image refs + attachments metadata)
  const userMessage = await appendMessage(prisma as any, projectId, 'user', userContent, conversationId, session.id, { messageType: 'user', metadata: userMeta })

  // Track user request in DB if ID provided
  if (req.request_id) {
    try {
      const urId = req.request_id
      await (prisma as any).userRequest.create({
        data: {
          id: urId,
          projectId,
          userMessageId: userMessage.id,
          sessionId: session.id,
          instruction: req.instruction,
          requestType: mode,
          isCompleted: false,
          createdAt: new Date(),
        },
      })
    } catch {}
  }

  let result: ExecResult
  try {
    // If this is the initial prompt, kick off dependency installation in background immediately
    try {
      if (req.is_initial_prompt && project.repoPath) {
        // fire-and-forget; chat continues
        void ensureDependenciesBackground(projectId, project.repoPath)
      }
    } catch {}

    // Optional: wait briefly for a WS consumer in single-process mode to reduce early-drop risk
    try {
      const DISABLE_BRIDGE = (process.env.WS_DISABLE_BRIDGE === '1' || process.env.WS_DISABLE_BRIDGE === 'true')
      const maxWait = parseInt(process.env.WS_WAIT_FOR_CONSUMER_MS || '0', 10)
      if (DISABLE_BRIDGE && maxWait > 0) {
        const start = Date.now()
        while ((wsRegistry as any).count && (wsRegistry as any).count(projectId) === 0 && (Date.now() - start) < maxWait) {
          await new Promise((r) => setTimeout(r, 50))
        }
      }
    } catch {}

    result = await runAdapter({
      projectId,
      instruction: req.instruction,
      cliType,
      mode,
      projectRepo: project.repoPath || null,
      conversationId,
      sessionId: session.id,
      isInitial: !!req.is_initial_prompt,
      images: req.images || [],
      streamId,
    })
  } catch (e: any) {
    result = { success: false, error: e?.message || 'Execution failed' }
  }

  if (result.assistantMessage) {
    const m = await appendMessage(prisma as any, projectId, 'assistant', result.assistantMessage, conversationId, session.id)
    publish(projectId, { type: 'message', data: { id: m.id, role: 'assistant', content: m.content, session_id: session.id, conversation_id: conversationId, created_at: m.createdAt }, timestamp: new Date().toISOString() } as any)
  }

  // If execution failed, persist an error message (parity with Python)
  if (!result.success) {
    try {
      const errText = result.error || 'Execution failed'
      const em = await appendMessage(prisma as any, projectId, 'assistant', errText, conversationId, session.id, { messageType: 'error', metadata: { type: mode === 'chat' ? 'chat_error' : 'act_error', cli_attempted: cliType } })
      publish(projectId, { type: 'message', data: { id: em.id, role: em.role, message_type: 'error', content: em.content, metadata_json: { type: mode === 'chat' ? 'chat_error' : 'act_error', cli_attempted: cliType }, session_id: session.id, conversation_id: conversationId, created_at: em.createdAt }, timestamp: new Date().toISOString() } as any)
    } catch {}
  }

  // Optional commit on success for ACT mode
  if (mode === 'act' && result.success) {
    const repo = project.repoPath as string | null
    if (repo) {
      try {
        if (await hasChanges(repo)) {
          const commitMessage = `916 ${cliType}: ${req.instruction.slice(0, 100)}`
          const commitRes = await commitAll(repo, commitMessage)
          if (!commitRes.success) {
            // emit an error as cli_output
            publish(projectId, { type: 'cli_output', output: `Commit failed: ${commitRes.error}`, cli_type: cliType } as any)
          } else if (commitRes.commit_hash) {
            try {
              await (prisma as any).commit.create({
                data: {
                  id: ((globalThis as any).crypto?.randomUUID?.() || require('node:crypto').randomUUID()),
                  projectId,
                  sessionId: session.id,
                  commitSha: commitRes.commit_hash,
                  message: commitMessage,
                  authorType: 'ai',
                  authorName: 'AI Assistant',
                  committedAt: new Date(),
                },
              })
            } catch {}
          }
        }
      } catch (e: any) {
        publish(projectId, { type: 'cli_output', output: `Commit check error: ${e?.message || e}`, cli_type: cliType } as any)
      }
    }
    // Auto-start preview server after successful initial prompt (parity with FastAPI)
    if (req.is_initial_prompt) {
      try {
        const repo = project.repoPath as string | null
        if (repo) {
          const st = getStatus(projectId)
          console.log(`[DEBUG] Preview auto-start check:`, {
            projectId,
            request_id: req.request_id,
            repo_exists: !!repo,
            preview_running: st.running,
            will_start: !st.running,
            timestamp: new Date().toISOString()
          })
          if (!st.running) {
            console.log(`[DEBUG] 🚀 Starting preview server for initial prompt:`, { projectId, request_id: req.request_id })
            await startPreview(projectId, repo)
          } else {
            console.log(`[DEBUG] ⏭️ Preview server already running, skipping start:`, { projectId, request_id: req.request_id })
          }
        }
      } catch {}
    }
  }

  await completeSession(prisma as any, session.id, !!result.success)

  // Mark user request completion
  if (req.request_id) {
    try {
      await (prisma as any).userRequest.update({
        where: { id: req.request_id },
        data: { isCompleted: true, isSuccessful: !!result.success, completedAt: new Date() },
      })
    } catch {}
  }


  // Broadcast complete
  publish(projectId, (
    mode === 'chat'
      ? { type: 'chat_complete', data: { status: result.success ? 'ok' : 'failed', session_id: session.id, error: result.error || null, request_id: req.request_id || null } }
      : { type: 'act_complete', data: { status: result.success ? 'ok' : 'failed', session_id: session.id, request_id: req.request_id || null } }
  ) as any)

  return {
    session_id: session.id,
    conversation_id: conversationId,
    status: result.success ? 'ok' : 'failed',
    message: result.success ? 'Completed' : (result.error || 'Failed'),
  }
}
