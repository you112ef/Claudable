import type { NextApiRequest, NextApiResponse } from 'next'
import { WebSocketServer } from 'ws'
import url from 'node:url'
import { wsRegistry } from '@repo/ws'
import { stopPreview } from '@repo/services/preview-runtime'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const anyRes = res as any
  
  // Initialize WebSocket server once per server instance
  if (!anyRes.socket.server.wss) {
    const wss = new WebSocketServer({ 
      server: anyRes.socket.server,
      perMessageDeflate: false, // Disable compression for simplicity
    })

    wss.on('connection', (socket, request) => {
      const projectId = extractProjectId(request.url)
      
      if (!projectId) {
        socket.close(1002, 'Invalid project ID')
        return
      }

      // Register socket
      wsRegistry.add(projectId, socket as any)
      
      // Handle ping/pong
      socket.on('message', (data) => {
        try {
          const message = data.toString('utf8')
          if (message === 'ping') {
            socket.send('pong')
          }
        } catch {
          // Ignore invalid messages
        }
      })

      // Cleanup on disconnect
      socket.on('close', async () => {
        wsRegistry.remove(projectId, socket as any)
        
        // Stop preview if no more connections
        if (wsRegistry.count(projectId) === 0) {
          await stopPreview(projectId).catch(() => {})
        }
      })

      // Handle errors gracefully
      socket.on('error', () => {
        wsRegistry.remove(projectId, socket as any)
      })
    })

    // Handle server errors
    wss.on('error', (err) => {
      console.error('[WebSocket] Server error:', err)
    })

    anyRes.socket.server.wss = wss
  }
  
  // Return OK for HTTP GET requests (used to initialize the WebSocket endpoint)
  res.status(200).json({ status: 'ok' })
}

// Extract project ID from URL path
function extractProjectId(urlPath?: string): string | null {
  if (!urlPath) return null
  
  try {
    const parsed = url.parse(urlPath, true)
    const parts = (parsed.pathname || '').split('/').filter(Boolean)
    const chatIndex = parts.indexOf('chat')
    
    if (chatIndex >= 0 && parts[chatIndex + 1]) {
      return parts[chatIndex + 1]
    }
  } catch {
    // Invalid URL
  }
  
  return null
}

export const config = { 
  api: { 
    bodyParser: false 
  } 
}