export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { stopPreview } from '@repo/services/preview-runtime'

export async function POST(_: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  try {
    await stopPreview(projectId)
    return NextResponse.json({ message: 'Preview stopped' })
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to stop preview' }, { status: 500 })
  }
}
