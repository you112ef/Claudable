export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getAllCliStatus } from '@repo/services/cli'

export async function GET() {
  const preferred_cli = process.env.DEFAULT_CLI || 'claude'
  const raw = await getAllCliStatus(preferred_cli)
  // Map to GlobalSettings UI shape: { [cli]: { installed, checking, version? } }
  const mapOne = (s: any) => ({ installed: !!s?.available, checking: false, version: s?.version || undefined })
  const out: any = {
    claude: mapOne(raw.claude),
    cursor: mapOne(raw.cursor),
    codex: mapOne(raw.codex),
    qwen: mapOne(raw.qwen),
    gemini: mapOne(raw.gemini),
  }
  return NextResponse.json(out)
}
