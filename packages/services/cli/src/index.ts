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
import { wsRegistry } from '@repo/ws'
import { commitAll, hasChanges } from '@repo/services-git'
import { getAdapter } from './adapters/registry'
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
  return prisma.message.create({ data: { id, projectId, role, content, conversationId: conversationId ?? null, sessionId: sessionId ?? null, messageType: opts?.messageType ?? null, metadataJson: opts?.metadata ? JSON.stringify(opts.metadata) : null, parentMessageId: opts?.parentMessageId ?? null, cliSource: opts?.cliSource ?? null } })
}

async function runAdapter(_: { projectId: string; instruction: string; cliType: string; mode: 'act' | 'chat'; projectRepo: string | null; conversationId: string; sessionId: string; isInitial?: boolean; images?: any[] }): Promise<ExecResult> {
  const adapter = getAdapter(_.cliType)
  // Attach simple streaming to WS as cli_output and persist assistant messages
  const prisma = await getPrisma()
  let lastAssistantMessageId: string | null = null
  let changesDetected = false
  try {
    for await (const ev of adapter.executeWithStreaming({
      instruction: _.instruction,
      projectPath: _.projectRepo || undefined,
      sessionId: _.sessionId,
      isInitialPrompt: !!_.isInitial,
      images: _.images || [],
    })) {
      if (ev.kind === 'output') {
        wsRegistry.broadcast(_.projectId, { type: 'cli_output', output: ev.text, cli_type: _.cliType } as any)
      } else if (ev.kind === 'message') {
        const m = await appendMessage(prisma as any, _.projectId, ev.role || 'assistant', ev.content || '', _.conversationId, _.sessionId, { messageType: ev.messageType || 'chat', metadata: ev.metadata || null, parentMessageId: ev.parentMessageId || null, cliSource: _.cliType })
        lastAssistantMessageId = m.id
        wsRegistry.broadcast(_.projectId, { type: 'message', data: { id: m.id, role: m.role, message_type: m.messageType ?? null, content: m.content, metadata_json: ev.metadata || null, parent_message_id: m.parentMessageId ?? null, session_id: m.sessionId ?? null, conversation_id: m.conversationId ?? null, cli_source: m.cliSource ?? null, created_at: m.createdAt }, timestamp: new Date().toISOString() } as any)
        if (ev.metadata && ev.metadata.changes_made) changesDetected = true
      } else if (ev.kind === 'result') {
        return { success: !!ev.success, error: ev.error || null, assistantMessage: null, changesDetected }
      }
    }
    // Fallback in case adapter finished without explicit result
    return { success: true, assistantMessage: null, changesDetected }
  } catch (e: any) {
    return { success: false, error: e?.message || String(e), assistantMessage: null, changesDetected }
  }
}

export async function executeInstruction(projectId: string, req: ActRequest, mode: 'act' | 'chat') {
  const prisma = await getPrisma()
  const project = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!project) throw new Error('Project not found')
  const cliType: string = (req.cli_preference ?? project.preferredCli ?? 'claude') as string
  const session = await createSession(prisma as any, projectId, cliType, req.instruction)
  const conversationId = req.conversation_id ?? ((globalThis as any).crypto?.randomUUID?.() || require('node:crypto').randomUUID())

  // Broadcast start
  wsRegistry.broadcast(projectId, (
    mode === 'chat'
      ? { type: 'chat_start', data: { session_id: session.id, instruction: req.instruction, request_id: req.request_id || null } }
      : { type: 'act_start', data: { session_id: session.id, instruction: req.instruction, request_id: req.request_id || null } }
  ) as any)

  // Append user message
  const userMessage = await appendMessage(prisma as any, projectId, 'user', req.instruction, conversationId, session.id, { messageType: 'user', metadata: req.is_initial_prompt ? { is_initial_prompt: true } : undefined })

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
    })
  } catch (e: any) {
    result = { success: false, error: e?.message || 'Execution failed' }
  }

  if (result.assistantMessage) {
    const m = await appendMessage(prisma as any, projectId, 'assistant', result.assistantMessage, conversationId, session.id)
    wsRegistry.broadcast(projectId, { type: 'message', data: { id: m.id, role: 'assistant', content: m.content, session_id: session.id, conversation_id: conversationId, created_at: m.createdAt }, timestamp: new Date().toISOString() } as any)
  }

  // If execution failed, persist an error message (parity with Python)
  if (!result.success) {
    try {
      const errText = result.error || 'Execution failed'
      const em = await appendMessage(prisma as any, projectId, 'assistant', errText, conversationId, session.id, { messageType: 'error', metadata: { type: mode === 'chat' ? 'chat_error' : 'act_error', cli_attempted: cliType } })
      wsRegistry.broadcast(projectId, { type: 'message', data: { id: em.id, role: em.role, message_type: 'error', content: em.content, metadata_json: { type: mode === 'chat' ? 'chat_error' : 'act_error', cli_attempted: cliType }, session_id: session.id, conversation_id: conversationId, created_at: em.createdAt }, timestamp: new Date().toISOString() } as any)
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
            wsRegistry.broadcast(projectId, { type: 'cli_output', output: `Commit failed: ${commitRes.error}`, cli_type: cliType } as any)
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
        wsRegistry.broadcast(projectId, { type: 'cli_output', output: `Commit check error: ${e?.message || e}`, cli_type: cliType } as any)
      }
    }
    // Auto-start preview server after successful initial prompt (parity with FastAPI)
    if (req.is_initial_prompt) {
      try {
        const repo = project.repoPath as string | null
        if (repo) {
          const st = getStatus(projectId)
          if (!st.running) {
            await startPreview(projectId, repo)
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
  wsRegistry.broadcast(projectId, (
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
