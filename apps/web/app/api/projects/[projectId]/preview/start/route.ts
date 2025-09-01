export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getPrisma } from '@repo/db'
import { startPreview } from '@repo/services/preview-runtime'

export async function POST(req: Request, ctx: { params: { projectId: string } }) {
  const projectId = ctx.params.projectId
  const body = await req.json().catch(() => ({})) as { port?: number }
  
  console.log(`[API] Preview start request for project ${projectId}`)
  
  try {
    const prisma = await getPrisma()
    const p = await (prisma as any).project.findUnique({ where: { id: projectId } })
    
    if (!p) {
      console.error(`[API] Project not found: ${projectId}`)
      return NextResponse.json({ detail: 'Project not found' }, { status: 404 })
    }
    
    const repo = p.repoPath as string | null
    if (!repo) {
      console.error(`[API] Project repository path not found for: ${projectId}`)
      return NextResponse.json({ detail: 'Project repository path not found' }, { status: 400 })
    }
    
    console.log(`[API] Starting preview for project ${projectId} at repo: ${repo}`)
    const result = await startPreview(projectId, repo, body?.port)
    console.log(`[API] Preview start result:`, result)
    
    if (!result.success) {
      console.error(`[API] Preview start failed:`, result.error)
      return NextResponse.json({ 
        running: false, 
        error: result.error ?? 'Failed to start preview', 
        port: result.port ?? undefined, 
        url: result.url ?? undefined 
      }, { status: 500 })
    }
    
    // Update project status in database
    await (prisma as any).project.update({ 
      where: { id: projectId }, 
      data: { status: 'preview_running', previewUrl: result.url ?? null } 
    }).catch((err: any) => {
      console.error(`[API] Failed to update project status:`, err)
    })
    
    console.log(`[API] Preview started successfully for ${projectId}: ${result.url}`)
    return NextResponse.json({ 
      running: true, 
      port: result.port, 
      url: result.url, 
      process_id: result.process_id ?? null, 
      error: null 
    })
  } catch (error) {
    console.error(`[API] Preview start exception:`, error)
    return NextResponse.json({ 
      running: false, 
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}
