export const runtime = 'nodejs'

export async function GET(req: Request) {
  const upgrade = req.headers.get('upgrade') || ''
  if ((upgrade as any).toLowerCase && (upgrade as any).toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 })
  }
  // Intentionally not implementing WS in App Router (Node runtime) here.
  // The WebSocket server is attached via pages API at /pages/api/chat/[...path].ts
  return new Response('WebSocket not available in current runtime', { status: 501 })
}
