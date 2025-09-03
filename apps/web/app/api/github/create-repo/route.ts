export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createRepo } from '@repo/services-github'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { repo_name?: string; description?: string; private?: boolean }
    const name = body.repo_name?.trim()
    if (!name) return NextResponse.json({ detail: 'repo_name is required' }, { status: 400 })

    const repo = await createRepo(name, body.description || '', body.private === true)
    return NextResponse.json(repo)
  } catch (e: any) {
    const msg = e?.message || ''
    const status = /token|auth|unauthorized/i.test(msg) ? 401 : 500
    return NextResponse.json({ detail: msg || 'Failed to create repository' }, { status })
  }
}

