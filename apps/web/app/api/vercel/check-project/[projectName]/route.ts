export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { checkProjectAvailable } from '@repo/services-vercel'

export async function GET(_: Request, ctx: { params: { projectName: string } }) {
  const { projectName } = ctx.params
  try {
    const res = await checkProjectAvailable(projectName)
    return NextResponse.json({ available: !!res.available })
  } catch (e: any) {
    const msg = e?.message || 'Failed to check project'
    const status = /token|auth|unauthorized/i.test(msg) ? 401 : 500
    return NextResponse.json({ detail: msg }, { status })
  }
}

