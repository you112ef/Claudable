export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process' 

export async function POST(_: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  try {
    const prisma = await getPrisma()
    const p = await (prisma as any).project.findUnique({ where: { id: projectId } })
    if (!p) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
    const repo = p.repoPath as string | null
    if (!repo) return NextResponse.json({ detail: 'Project repository path not found' }, { status: 400 })
    const pkg = path.join(repo, 'package.json')
    if (!fs.existsSync(pkg)) return NextResponse.json({ message: 'No package.json; nothing to install', project_id: projectId })
    try {
      const child = spawn('npm', ['install'], { cwd: repo, stdio: 'ignore', detached: true })
      child.unref()
    } catch {}
    return NextResponse.json({ message: 'Dependency installation started in background', project_id: projectId })
  } catch (e) {
    return NextResponse.json({ detail: 'Failed to start dependency installation' }, { status: 500 })
  }
}

