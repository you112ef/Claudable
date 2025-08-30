export const runtime = 'nodejs'

import { NextResponse } from 'next/server'

type GlobalSettings = { default_cli: string; cli_settings: Record<string, any> }
const store: GlobalSettings = { default_cli: process.env.DEFAULT_CLI || 'claude', cli_settings: {} }

export async function GET() {
  return NextResponse.json(store)
}

export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body.default_cli === 'string' && body.default_cli.length > 0) store.default_cli = body.default_cli
    if (body.cli_settings && typeof body.cli_settings === 'object') store.cli_settings = body.cli_settings
    return NextResponse.json({ message: 'updated', ...store })
  } catch {
    return NextResponse.json({ detail: 'Invalid body' }, { status: 400 })
  }
}

