export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'
import { pushToGithub } from '@repo/services-github'
import { getPlainToken } from '@repo/services/tokens'
import { spawn } from 'node:child_process'

export async function POST(req: Request, ctx: { params: { projectId: string } }) {
  const { projectId } = ctx.params
  const body = await req.json().catch(() => ({})) as { branch?: string }
  
  const prisma = await getPrisma()
  const project = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
  if (!project.repoPath) return NextResponse.json({ success: false, message: 'No repo path' }, { status: 400 })
  
  // Ensure origin remote includes PAT if available (mirrors FastAPI behavior)
  try {
    const conn = await (prisma as any).projectServiceConnection.findFirst({ where: { projectId, provider: 'github' } })
    const data = conn?.serviceData ? JSON.parse(conn.serviceData) : {}
    const fullName = data.full_name
    const owner = data.owner || (fullName ? String(fullName).split('/')[0] : null)
    const token = await getPlainToken('github')
    if (fullName && token) {
      const originUrl = `https://${owner}:${token}@github.com/${fullName}.git`
      await new Promise<void>((resolve) => { const c = spawn('git', ['remote', 'set-url', 'origin', originUrl], { cwd: project.repoPath as string, stdio: 'ignore' }); c.on('close', () => resolve()); c.on('error', () => resolve()); })
    }
  } catch {}
  
  const res = await pushToGithub(projectId, project.repoPath, body.branch)
  // Mirror FastAPI: on successful push, update Vercel connection's last_published_at
  try {
    if (res.success) {
      const vercelConn = await (prisma as any).projectServiceConnection.findFirst({ where: { projectId, provider: 'vercel' } })
      if (vercelConn) {
        const data = vercelConn.serviceData ? JSON.parse(vercelConn.serviceData) : {}
        data.last_published_at = new Date().toISOString()
        await (prisma as any).projectServiceConnection.update({ where: { id: vercelConn.id }, data: { serviceData: JSON.stringify(data), updatedAt: new Date() } })
      }
    }
  } catch {}
  return NextResponse.json(res, { status: res.success ? 200 : 500 })
}
