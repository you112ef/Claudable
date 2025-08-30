export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { projectExists, assetsDir, writeBytes } from '@repo/services/assets'
import path from 'node:path'

export async function POST(req: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  if (!(await projectExists(projectId))) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ detail: 'File is required' }, { status: 400 })
    const contentType = file.type || ''
    if (!contentType.startsWith('image/')) return NextResponse.json({ detail: 'File must be an image' }, { status: 400 })

    const ab = await file.arrayBuffer()
    const buf = Buffer.from(ab)
    const ext = path.extname((file as any).name || 'image.png') || '.png'
    const unique = (globalThis as any).crypto?.randomUUID?.() || require('node:crypto').randomUUID()
    const filename = `${unique}${ext}`
    const absPath = path.join(assetsDir(projectId), filename)
    await writeBytes(absPath, buf)
    return NextResponse.json({
      path: `assets/${filename}`,
      absolute_path: absPath,
      filename,
      original_filename: (file as any).name || `upload${ext}`,
    })
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to save file' }, { status: 500 })
  }
}
