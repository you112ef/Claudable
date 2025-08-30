export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { listActiveMonitoring } from '@repo/services-vercel'

export async function GET() {
  return NextResponse.json(listActiveMonitoring())
}

