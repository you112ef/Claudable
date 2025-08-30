import type { NextApiRequest, NextApiResponse } from 'next'
import { WebSocketServer } from 'ws'
import url from 'node:url'
import { wsRegistry } from '@repo/ws'

// Attach a single WebSocketServer to Next's underlying HTTP server
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const anyRes = res as any
  const anyReq = req as any
  // If not already set, create and bind WSS
  if (!anyRes.socket.server.__WSS__) {
    const wss = new WebSocketServer({ server: anyRes.socket.server })
    wss.on('connection', (socket, request) => {
      try {
        const parsed = url.parse(request.url || '', true)
        const parts = (parsed.pathname || '').split('/').filter(Boolean)
        // Expect path like /api/chat/{projectId}
        const idx = parts.indexOf('chat')
        const projectId = idx >= 0 ? parts[idx + 1] : null
        if (!projectId) {
          try { (socket as any).close() } catch {}
          return
        }
        wsRegistry.add(projectId, socket as any)
        ;(socket as any).on('message', (data: any) => {
          try { if (String(data) === 'ping') (socket as any).send('pong') } catch {}
        })
        socket.on('close', () => wsRegistry.remove(projectId, socket as any))
        socket.on('error', () => wsRegistry.remove(projectId, socket as any))
      } catch {}
    })
    anyRes.socket.server.__WSS__ = wss
  }
  res.status(200).end('ok')
}

export const config = {
  api: {
    bodyParser: false,
  },
}

