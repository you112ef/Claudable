export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { isRepoAvailable } from '@repo/services-github'

export async function GET(_req: Request, ctx: { params: { repoName: string } }) {
  const { repoName } = ctx.params
  try {
    const res = await isRepoAvailable(repoName)
    if (res.available) return NextResponse.json({ available: true, username: res.username })
    return NextResponse.json({ available: false, reason: res.reason || 'Repository exists' }, { status: 409 })
  } catch (e: any) {
    const msg = e?.message || ''
    const status = /token|auth|unauthorized/i.test(msg) ? 401 : 500
    return NextResponse.json({ detail: msg || 'Failed to check repository' }, { status })
  }
}

