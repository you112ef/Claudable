export const runtime = 'nodejs'

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ detail: 'Not implemented' }, { status: 501 })
}

export async function PUT() {
  return NextResponse.json({ detail: 'Not implemented' }, { status: 501 })
}

export async function DELETE() {
  return NextResponse.json({ detail: 'Not implemented' }, { status: 501 })
}

