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
        // Expect path like /api/ws/chat/{projectId}
        const idx = parts.indexOf('chat')
        const projectId = idx >= 0 ? parts[idx + 1] : null
        if (!projectId) { try { (socket as any).close() } catch {}; return }
        
        wsRegistry.add(projectId, socket as any)
        try { (wsRegistry as any).flushPending(projectId) } catch {}
        ;(socket as any).on('message', (data: any) => {
          try { 
            // Validate UTF-8 encoding
            const message = Buffer.isBuffer(data) ? data.toString('utf8') : String(data)
            if (message === 'ping') (socket as any).send('pong') 
          } catch (error) {
            // Silent failure - invalid message format
          }
        })
        const onGone = async () => {
          wsRegistry.remove(projectId, socket as any)
          const remainingConnections = wsRegistry.count(projectId)
          
          // If no more connections for this project, stop its preview server
          if (remainingConnections === 0) {
            try {
              await stopPreview(projectId)
            } catch (e) {
              // Silent failure - preview may not be running
            }
          }
        }
        socket.on('close', onGone)
        socket.on('error', () => {
          onGone()
        })
      } catch {}
    })
    anyRes.socket.server.__WSS__ = wss
  }
  // For GET requests used to "prime" the WS server, simply return OK
  res.status(200).end('ok')
}

export const config = { api: { bodyParser: false } }
