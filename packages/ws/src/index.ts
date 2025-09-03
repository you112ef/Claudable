// Shared WebSocket event types and a minimal in-memory project registry
// Start server-side WS acceptor in Node runtime (fire-and-forget) unless disabled
if (process.env.WS_STANDALONE === '1' || process.env.WS_STANDALONE === 'true') {
  try { import('./server').catch(() => {}) } catch {}
}

export type WSMessageEvent = {
  type: 'message'
  data: any
  timestamp?: string
}

export type WSChatStart = { type: 'chat_start'; session_id: string; conversation_id?: string }
export type WSChatComplete = { type: 'chat_complete'; session_id: string; conversation_id?: string }
export type WSActStart = { type: 'act_start'; session_id: string; instruction: string }
export type WSActComplete = { type: 'act_complete'; session_id: string; success: boolean; message?: string }
export type WSProjectStatus = { type: 'project_status'; status: string; project_id: string; details?: any }
export type WSPreviewError = { type: 'preview_error'; project_id: string; message: string }
export type WSPreviewSuccess = { type: 'preview_success'; project_id: string; url: string; port: number }
export type WSCliOutput = { type: 'cli_output'; output: string; cli_type: string }
export type WSMessagesCleared = { type: 'messages_cleared'; project_id: string; conversation_id?: string }
export type WSMessageDelta = {
  type: 'message_delta'
  data: { stream_id: string; seq: number; role: 'assistant' | 'system' | 'tool' | 'user'; message_type?: string | null; content_delta: string }
  timestamp?: string
}
export type WSMessageCommit = {
  type: 'message_commit'
  data: { stream_id: string; message_id: string; created_at: string; role: 'assistant' | 'system' | 'tool' | 'user'; message_type?: string | null; content_full: string; conversation_id?: string | null; session_id?: string | null }
  timestamp?: string
}

export type WSEvent =
  | WSMessageEvent
  | WSChatStart
  | WSChatComplete
  | WSActStart
  | WSActComplete
  | WSProjectStatus
  | WSPreviewError
  | WSPreviewSuccess
  | WSCliOutput
  | WSMessagesCleared
  | WSMessageDelta
  | WSMessageCommit

export interface ProjectSocketLike {
  send: (data: string | ArrayBufferLike | Blob | ArrayBufferView) => void
  readyState?: number
}

class ProjectRegistry {
  private rooms = new Map<string, Set<ProjectSocketLike>>()
  private pending = new Map<string, Array<{ event: WSEvent; ts: number }>>()

  add(projectId: string, ws: ProjectSocketLike) {
    if (!this.rooms.has(projectId)) this.rooms.set(projectId, new Set())
    this.rooms.get(projectId)!.add(ws)
    // On new connection, opportunistically flush any pending events
    try { this.flushPending(projectId) } catch {}
  }

  remove(projectId: string, ws: ProjectSocketLike) {
    const set = this.rooms.get(projectId)
    if (!set) return
    set.delete(ws)
    if (set.size === 0) this.rooms.delete(projectId)
  }

  count(projectId: string): number {
    const set = this.rooms.get(projectId)
    return set ? set.size : 0
  }

  broadcast(projectId: string, event: WSEvent) {
    const set = this.rooms.get(projectId)
    if (!set) return
    
    try {
      // Ensure UTF-8 safe JSON serialization
      const payload = JSON.stringify(event, (key, value) => {
        if (typeof value === 'string') {
          // Replace invalid UTF-8 sequences and control characters
          return value.replace(/[\x00-\x1F\x7F-\x9F]/g, '').replace(/[\uFFFE\uFFFF]/g, '')
        }
        return value
      })
      
      for (const ws of Array.from(set)) {
        try {
          // Send as text frame with explicit UTF-8 encoding
          ws.send(payload)
        } catch (error) {
          set.delete(ws)
        }
      }
    } catch (error) {
      // Silent failure - JSON serialization failed
    }
  }

  queue(projectId: string, event: WSEvent) {
    const now = Date.now()
    const arr = this.pending.get(projectId) || []
    // Maintain small queue, drop old ones beyond TTL
    const TTL = 2000
    const MAX = 50
    const filtered = arr.filter((it) => now - it.ts <= TTL)
    filtered.push({ event, ts: now })
    while (filtered.length > MAX) filtered.shift()
    this.pending.set(projectId, filtered)
  }

  flushPending(projectId: string) {
    const set = this.rooms.get(projectId)
    if (!set || set.size === 0) return
    const items = this.pending.get(projectId)
    if (!items || !items.length) return
    const now = Date.now()
    const TTL = 2000
    // send only recent items
    const recent = items.filter((it) => now - it.ts <= TTL)
    this.pending.delete(projectId)
    for (const it of recent) this.broadcast(projectId, it.event)
  }
}

// Ensure a single registry instance across Next.js pages/app bundles
// by storing on the Node global object.
declare global {
  // eslint-disable-next-line no-var
  var __WS_REGISTRY__: ProjectRegistry | undefined
}

const registry: ProjectRegistry = (globalThis as any).__WS_REGISTRY__ || new ProjectRegistry()
;(globalThis as any).__WS_REGISTRY__ = registry

export const wsRegistry = registry

// Optional HTTP bridge publisher to reach WS server in a separate runtime
export async function publish(projectId: string, event: WSEvent): Promise<void> {
  const DISABLE_BRIDGE = (process.env.WS_DISABLE_BRIDGE === '1' || process.env.WS_DISABLE_BRIDGE === 'true')
  try {
    // Prefer direct broadcast when sockets are present in this runtime
    try {
      const hasSockets = typeof (wsRegistry as any).count === 'function' && (wsRegistry as any).count(projectId) > 0
      if (hasSockets) {
        wsRegistry.broadcast(projectId, event)
        return
      }
    } catch {}

    // In single-process local setup, skip HTTP bridge entirely if disabled via env
    if (DISABLE_BRIDGE) {
      // queue for short time to flush when connection arrives
      try { (wsRegistry as any).queue(projectId, event) } catch {}
      return
    }

    // Bridge URL resolution
    const bridgeUrl = process.env.WS_BRIDGE_URL
      || (process.env.WS_BRIDGE_BASE_URL ? `${process.env.WS_BRIDGE_BASE_URL.replace(/\/$/, '')}/api/ws/broadcast` : '')
      || (typeof window !== 'undefined' ? `${window.location.origin}/api/ws/broadcast` : 'http://localhost:3000/api/ws/broadcast')

    const token = process.env.WS_BRIDGE_TOKEN
    // Fire-and-forget is acceptable for many call sites; still await here to surface errors to caller if awaited
    await fetch(bridgeUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { 'x-ws-token': token } : {}),
      },
      body: JSON.stringify({ projectId, event }),
    }).catch(() => {})
  } catch {
    // Swallow errors to avoid cascading failures in callers
  }
}
