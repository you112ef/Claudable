import http from 'node:http'
import url from 'node:url'
import { WebSocketServer } from 'ws'
import { wsRegistry } from './index'

declare global {
  // eslint-disable-next-line no-var
  var __WS_SERVER__: http.Server | undefined
}

function ensureServer() {
  if (global.__WS_SERVER__) return global.__WS_SERVER__
  const port = parseInt(process.env.WS_PORT || '8787', 10)
  const server = http.createServer((_req, res) => {
    res.writeHead(200)
    res.end('WS server running')
  })
  const wss = new WebSocketServer({ server })
  // Surface server-level errors to avoid process crash
  wss.on('error', (err) => {
    try {
      console.error('[WS] Server error:', err)
    } catch {}
  })

  wss.on('connection', (socket, req) => {
    try {
      const parsed = url.parse(req.url || '', true)
      const parts = (parsed.pathname || '').split('/').filter(Boolean)
      // Expect path like /api/chat/{projectId}
      const projectId = parts[2]
      if (!projectId) {
        // Use a valid close code for protocol error
        try { socket.close(1002, 'Protocol error') } catch {}
        return
      }
      wsRegistry.add(projectId, socket as any)
      // Basic ping/pong support
      ;(socket as any).on('message', (data: any) => {
        try {
          const s = typeof data === 'string' ? data : String(data)
          if (s === 'ping') {
            ;(socket as any).send('pong')
          }
        } catch {}
      })
      socket.on('close', (code: number, reason: Buffer) => {
        try {
          const msg = reason ? reason.toString('utf8') : ''
          console.log(`[WS] Closed: code=${code} reason=${msg}`)
        } catch {}
        wsRegistry.remove(projectId, socket as any)
      })
      socket.on('error', (err) => {
        try { console.error('[WS] Socket error:', err) } catch {}
        wsRegistry.remove(projectId, socket as any)
      })
    } catch {
      try { (socket as any).close() } catch {}
    }
  })
  server.listen(port)
  global.__WS_SERVER__ = server
  return server
}

// Start on import in Node runtime
if (typeof process !== 'undefined') {
  ensureServer()
}
