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

export interface ProjectSocketLike {
  send: (data: string | ArrayBufferLike | Blob | ArrayBufferView) => void
  readyState?: number
}

class ProjectRegistry {
  private rooms = new Map<string, Set<ProjectSocketLike>>()

  add(projectId: string, ws: ProjectSocketLike) {
    if (!this.rooms.has(projectId)) this.rooms.set(projectId, new Set())
    this.rooms.get(projectId)!.add(ws)
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
