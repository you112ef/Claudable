export const runtime = 'nodejs'

import { NextResponse } from 'next/server'

export async function DELETE() {
  return NextResponse.json({ detail: 'Not implemented' }, { status: 501 })
}

