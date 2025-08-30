export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPrisma } from '@repo/db'
import { wsRegistry } from '@repo/ws'

function parseMeta(meta: any): any | null {
  if (!meta) return null
  if (typeof meta === 'string') {
    try { return JSON.parse(meta) } catch { return null }
  }
  return meta
}

export async function GET(req: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  const url = new URL(req.url)
  const conversationId = url.searchParams.get('conversation_id')
  const cliFilter = url.searchParams.get('cli_filter')
  const limitParam = parseInt(url.searchParams.get('limit') || '100', 10)
  const limit = Math.min(Math.max(1, isNaN(limitParam) ? 100 : limitParam), 1000)
  try {
    const prisma = await getPrisma()
    const where: any = { projectId }
    if (conversationId) where.conversationId = conversationId
    if (cliFilter) where.cliSource = cliFilter
    const rows = await (prisma as any).message.findMany({ where, orderBy: { createdAt: 'asc' }, take: limit })
    const filtered = rows.filter((r: any) => {
      const meta = parseMeta(r.metadataJson)
      return !(meta && meta.hidden_from_ui === true)
    })
    const mapped = filtered.map((r: any) => ({
      id: r.id,
      role: r.role,
      message_type: r.messageType ?? null,
      content: r.content,
      metadata_json: parseMeta(r.metadataJson),
      parent_message_id: r.parentMessageId ?? null,
      session_id: r.sessionId ?? null,
      conversation_id: r.conversationId ?? null,
      cli_source: r.cliSource ?? null,
      created_at: r.createdAt,
    }))
    return NextResponse.json(mapped)
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to fetch messages' }, { status: 500 })
  }
}

const SendMessageSchema = z.object({
  content: z.string().min(1),
  role: z.string().optional(),
  conversation_id: z.string().nullable().optional(),
})

export async function POST(req: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  const body = await req.json().catch(() => null)
  const parsed = SendMessageSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
  try {
    const prisma = await getPrisma()
    const id = (globalThis as any).crypto?.randomUUID?.() || require('node:crypto').randomUUID()
    const row = await (prisma as any).message.create({
      data: {
        id,
        projectId,
        role: parsed.data.role || 'user',
        content: parsed.data.content,
        conversationId: parsed.data.conversation_id ?? null,
      },
    })
    const event = {
      type: 'message',
      data: {
        id: row.id,
        role: row.role,
        message_type: row.messageType ?? null,
        content: row.content,
        metadata: parseMeta(row.metadataJson) ?? null,
        parent_message_id: row.parentMessageId ?? null,
        session_id: row.sessionId ?? null,
        conversation_id: row.conversationId ?? null,
        created_at: row.createdAt,
      },
      timestamp: new Date().toISOString(),
    }
    wsRegistry.broadcast(projectId, event as any)
    return NextResponse.json({
      id: row.id,
      role: row.role,
      message_type: row.messageType ?? null,
      content: row.content,
      metadata_json: parseMeta(row.metadataJson) ?? null,
      parent_message_id: row.parentMessageId ?? null,
      session_id: row.sessionId ?? null,
      conversation_id: row.conversationId ?? null,
      created_at: row.createdAt,
    })
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to create message' }, { status: 500 })
  }
}

export async function DELETE(req: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  const url = new URL(req.url)
  const conversationId = url.searchParams.get('conversation_id')
  try {
    const prisma = await getPrisma()
    const where: any = { projectId }
    if (conversationId) where.conversationId = conversationId
    const res = await (prisma as any).message.deleteMany({ where })
    wsRegistry.broadcast(projectId, { type: 'messages_cleared', project_id: projectId, conversation_id: conversationId || undefined } as any)
    return NextResponse.json({ deleted: res.count || 0 })
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to delete messages' }, { status: 500 })
  }
}
