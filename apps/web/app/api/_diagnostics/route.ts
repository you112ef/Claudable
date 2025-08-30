export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { projectRoot, dataDir, projectsRoot, previewPorts, prismaDatabaseUrl, loadEnv } from '@repo/config'
import { createLogger } from '@repo/logging'

const log = createLogger('diagnostics')

export async function GET() {
  // Disable in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ detail: 'Not found' }, { status: 404 })
  }
  loadEnv()
  const info = {
    projectRoot: projectRoot(),
    dataDir: dataDir(),
    projectsRoot: projectsRoot(),
    previewPorts: previewPorts(),
    prismaDatabaseUrl: prismaDatabaseUrl().replace(/:\/\/.*/, ':***redacted***'),
  }
  log.info('Diagnostics fetched', info)
  return NextResponse.json({ ok: true, info })
}

