export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { isRepoAvailable } from '@repo/services-github'

export async function GET(_: Request, ctx: { params: { repoName: string } }) {
  const { repoName } = ctx.params
  try {
    const res = await isRepoAvailable(repoName)
    if (res.available) return NextResponse.json({ available: true, username: res.username })
    return NextResponse.json({ available: false, reason: res.reason || 'unavailable', username: res.username })
  } catch (e: any) {
    const msg = e?.message || 'Failed to check repository'
    if (/token/i.test(msg) || /auth/i.test(msg)) return NextResponse.json({ detail: msg }, { status: 401 })
    return NextResponse.json({ detail: msg }, { status: 500 })
  }
}

