export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPlainToken, updateLastUsed, isValidProvider } from '@repo/services-tokens'

export async function GET(_: Request, ctx: { params: { provider: string } }) {
  const provider = ctx.params.provider
  if (!isValidProvider(provider)) {
    return NextResponse.json({ detail: 'Invalid provider' }, { status: 400 })
  }
  try {
    const token = await getPlainToken(provider)
    if (!token) return NextResponse.json({ detail: 'Token not found' }, { status: 404 })
    // Update last used, but do not block response if it fails
    updateLastUsed(provider).catch(() => {})
    return NextResponse.json({ token })
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to fetch token' }, { status: 500 })
  }
}
