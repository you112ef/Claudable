import { z } from 'zod'
import { getPrisma } from '@repo/db'
import { wsRegistry } from '@repo/ws'
import { commitAll, hasChanges } from '@repo/services-git' 

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

async function appendMessage(prisma: any, projectId: string, role: string, content: string, conversationId?: string | null, sessionId?: string | null) {
  const id = (globalThis as any).crypto?.randomUUID?.() || require('node:crypto').randomUUID()
  return prisma.message.create({ data: { id, projectId, role, content, conversationId: conversationId ?? null, sessionId: sessionId ?? null } })
}

async function runAdapter(_: { projectId: string; instruction: string; cliType: string; mode: 'act' | 'chat' }): Promise<ExecResult> {
  // Placeholder adapter execution: report unavailable
  return { success: false, error: `CLI '${_.cliType}' is not configured`, assistantMessage: null, changesDetected: false }
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
      ? { type: 'chat_start', data: { session_id: session.id, instruction: req.instruction } }
      : { type: 'act_start', data: { session_id: session.id, instruction: req.instruction, request_id: conversationId } }
  ) as any)

  // Append user message
  await appendMessage(prisma as any, projectId, 'user', req.instruction, conversationId, session.id)

  let result: ExecResult
  try {
    result = await runAdapter({ projectId, instruction: req.instruction, cliType, mode })
  } catch (e: any) {
    result = { success: false, error: e?.message || 'Execution failed' }
  }

  if (result.assistantMessage) {
    const m = await appendMessage(prisma as any, projectId, 'assistant', result.assistantMessage, conversationId, session.id)
    wsRegistry.broadcast(projectId, { type: 'message', data: { id: m.id, role: 'assistant', content: m.content, session_id: session.id, conversation_id: conversationId, created_at: m.createdAt }, timestamp: new Date().toISOString() } as any)
  }

  
  // Optional commit on success for ACT mode
  if (mode === 'act' && result.success) {
    const repo = project.repoPath as string | null
    if (repo) {
      try {
        if (await hasChanges(repo)) {
          const commitRes = await commitAll(repo, 'chore(act): apply changes')
          if (!commitRes.success) {
            // emit an error as cli_output
            wsRegistry.broadcast(projectId, { type: 'cli_output', output: `Commit failed: ${commitRes.error}`, cli_type: cliType } as any)
          }
        }
      } catch (e: any) {
        wsRegistry.broadcast(projectId, { type: 'cli_output', output: `Commit check error: ${e?.message || e}`, cli_type: cliType } as any)
      }
    }
  }

  await completeSession(prisma as any, session.id, !!result.success)


  // Broadcast complete
  wsRegistry.broadcast(projectId, (
    mode === 'chat'
      ? { type: 'chat_complete', data: { status: result.success ? 'ok' : 'failed', session_id: session.id, error: result.error || null } }
      : { type: 'act_complete', data: { status: result.success ? 'ok' : 'failed', session_id: session.id } }
  ) as any)

  return {
    session_id: session.id,
    conversation_id: conversationId,
    status: result.success ? 'ok' : 'failed',
    message: result.success ? 'Completed' : (result.error || 'Failed'),
  }
}
