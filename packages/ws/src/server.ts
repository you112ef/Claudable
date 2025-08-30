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
  wss.on('connection', (socket, req) => {
    try {
      const parsed = url.parse(req.url || '', true)
      const parts = (parsed.pathname || '').split('/').filter(Boolean)
      // Expect path like /api/chat/{projectId}
      const projectId = parts[2]
      if (!projectId) {
        socket.close()
        return
      }
      wsRegistry.add(projectId, socket as any)
      socket.on('close', () => wsRegistry.remove(projectId, socket as any))
      socket.on('error', () => wsRegistry.remove(projectId, socket as any))
    } catch {
      try { (socket as any).close() } catch {}
    }
  })
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[ws] server listening on ws://localhost:${port}`)
  })
  global.__WS_SERVER__ = server
  return server
}

// Start on import in Node runtime
if (typeof process !== 'undefined') {
  ensureServer()
}

