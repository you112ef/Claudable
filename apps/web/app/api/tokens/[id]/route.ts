export const runtime = 'nodejs'

import { NextResponse } from 'next/server'

// Note: This dynamic segment handles two API shapes on the same path:
// - GET /api/tokens/{provider}
// - DELETE /api/tokens/{token_id}
// The concrete semantics depend on the HTTP method.
export async function GET() {
  return NextResponse.json({ detail: 'Not implemented' }, { status: 501 })
}

export async function DELETE() {
  return NextResponse.json({ detail: 'Not implemented' }, { status: 501 })
}

