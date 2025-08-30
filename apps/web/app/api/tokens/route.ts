export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { saveServiceToken } from '@repo/services-tokens'

const CreateSchema = z.object({
  provider: z.enum(['github', 'supabase', 'vercel']),
  token: z.string().min(1),
  name: z.string().optional(),
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = CreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ detail: 'Invalid request body' }, { status: 400 })
    }
    const { provider, token, name } = parsed.data
    const meta = await saveServiceToken(provider, token, name)
    return NextResponse.json({
      id: meta.id,
      provider: meta.provider,
      name: meta.name,
      created_at: meta.created_at,
      last_used: meta.last_used,
    })
  } catch (e: any) {
    const msg = e?.message || 'Failed to save token'
    const status = msg.includes('Invalid provider') || msg.includes('Token cannot be empty') ? 400 : 500
    return NextResponse.json({ detail: status === 400 ? msg : 'Failed to save token' }, { status })
  }
}
