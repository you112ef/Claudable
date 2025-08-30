export const runtime = 'nodejs'

export async function GET() {
  return new Response(JSON.stringify({ detail: 'Not implemented' }), { status: 501 })
}

