export const runtime = 'nodejs'

export async function GET(req: Request) {
  const upgrade = req.headers.get('upgrade') or ''
  if ((upgrade as any).toLowerCase && (upgrade as any).toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 })
  }
  return new Response('WebSocket not available in current runtime', { status: 501 })
}

