export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'

export async function GET(_: Request, ctx: { params: { projectId: string } }) {
  const { projectId } = ctx.params
  try {
    const prisma = await getPrisma()
    const activeCount = await (prisma as any).userRequest.count({ where: { projectId, isCompleted: false } })
    return NextResponse.json({ hasActiveRequests: activeCount > 0, activeCount })
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to get active requests' }, { status: 500 })
  }
}

