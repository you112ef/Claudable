import type { NextApiRequest, NextApiResponse } from 'next'
import { WebSocketServer } from 'ws'
import url from 'node:url'
import { wsRegistry } from '@repo/ws'
import { stopPreview } from '@repo/services/preview-runtime'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const anyRes = res as any
  if (!anyRes.socket.server.__WSS__) {
    const wss = new WebSocketServer({ server: anyRes.socket.server })
    wss.on('connection', (socket, request) => {
      try {
        const parsed = url.parse(request.url || '', true)
        const parts = (parsed.pathname || '').split('/').filter(Boolean)
        const idx = parts.indexOf('chat')
        const projectId = idx >= 0 ? parts[idx + 1] : null
        if (!projectId) { try { (socket as any).close() } catch {}; return }
        wsRegistry.add(projectId, socket as any)
        ;(socket as any).on('message', (data: any) => {
          try { if (String(data) === 'ping') (socket as any).send('pong') } catch {}
        })
        const onGone = async () => {
          wsRegistry.remove(projectId, socket as any)
          // If no more connections for this project, stop its preview server
          try {
            if (wsRegistry.count(projectId) === 0) {
              await stopPreview(projectId)
            }
          } catch {}
        }
        socket.on('close', onGone)
        socket.on('error', onGone)
      } catch {}
    })
    anyRes.socket.server.__WSS__ = wss
  }
  res.status(200).end('ok')
}

export const config = { api: { bodyParser: false } }
