export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServiceTokenMetadata, deleteServiceToken, isValidProvider } from '@repo/services/tokens'

export async function GET(_: Request, ctx: { params: { id: string } }) {
  const id = ctx.params.id
  if (!isValidProvider(id)) {
    return NextResponse.json({ detail: 'Invalid provider' }, { status: 400 })
  }
  try {
    const meta = await getServiceTokenMetadata(id)
    if (!meta) return NextResponse.json({ detail: 'Token not found' }, { status: 404 })
    return NextResponse.json({
      id: meta.id,
      provider: meta.provider,
      name: meta.name,
      created_at: meta.created_at,
      last_used: meta.last_used,
    })
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to fetch token' }, { status: 500 })
  }
}

export async function DELETE(_: Request, ctx: { params: { id: string } }) {
  const tokenId = ctx.params.id
  try {
    const ok = await deleteServiceToken(tokenId)
    if (!ok) return NextResponse.json({ detail: 'Token not found' }, { status: 404 })
    return NextResponse.json({ message: 'Token deleted successfully' })
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to delete token' }, { status: 500 })
  }
}
