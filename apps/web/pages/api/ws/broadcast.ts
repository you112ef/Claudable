import type { NextApiRequest, NextApiResponse } from 'next'
import { wsRegistry } from '@repo/ws'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).end('Method Not Allowed')
    return
  }

  try {
    // Optional token guard for internal-only access
    const expected = process.env.WS_BRIDGE_TOKEN
    if (expected) {
      const got = (req.headers['x-ws-token'] || req.headers['x-wsbridge-token'] || '') as string
      if (!got || got !== expected) {
        res.status(403).json({ detail: 'Forbidden' })
        return
      }
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const projectId = body?.projectId
    const event = body?.event
    if (!projectId || !event || typeof event !== 'object' || !event.type) {
      res.status(400).json({ detail: 'Invalid body' })
      return
    }
    try {
      wsRegistry.broadcast(projectId, event)
    } catch {}
    res.status(204).end('')
    return
  } catch (e) {
    res.status(500).json({ detail: 'Broadcast failed' })
    return
  }
}

export const config = { api: { bodyParser: true } }
