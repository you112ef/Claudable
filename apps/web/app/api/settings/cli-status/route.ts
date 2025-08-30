export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getAllCliStatus } from '@repo/services-cli/src/status'

export async function GET() {
  const preferred_cli = process.env.DEFAULT_CLI || 'claude'
  const status = await getAllCliStatus(preferred_cli)
  return NextResponse.json(status)
}

