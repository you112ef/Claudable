export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import { assetFilePath, assetsDir, contentTypeFromFilename, projectExists } from '@repo/services-assets'

export async function GET(_: Request, ctx: { params: { projectId: string; filename: string } }) {
  const { projectId, filename } = ctx.params
  if (!(await projectExists(projectId))) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  try {
    const dir = assetsDir(projectId)
    let fullPath: string
    try {
      fullPath = assetFilePath(projectId, filename)
    } catch {
      return NextResponse.json({ detail: 'Image not found' }, { status: 404 })
    }
    // Verify exists within assets dir
    const stat = await fs.stat(fullPath).catch(() => null)
    if (!stat || !stat.isFile()) return NextResponse.json({ detail: 'Image not found' }, { status: 404 })
    const data = await fs.readFile(fullPath)
    const headers = new Headers()
    headers.set('Content-Type', contentTypeFromFilename(filename))
    return new Response(data, { status: 200, headers })
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to read image' }, { status: 500 })
  }
}
