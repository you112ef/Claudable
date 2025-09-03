export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createDeployment } from '@repo/services-vercel'
import { getPrisma } from '@repo/db'

export async function POST(req: Request, ctx: { params: { projectId: string } }) {
  const { projectId } = ctx.params
  const body = await req.json().catch(() => ({})) as { branch?: string }

  const prisma = await getPrisma()

  // 1) 프로젝트 확인
  const project = await (prisma as any).project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ detail: 'Project not found' }, { status: 404 })

  // 2) 토큰/연결 상태 확인 (FastAPI 엔드포인트와 동등한 검증)
  const tokenRow = await (prisma as any).serviceToken.findFirst({ where: { provider: 'vercel' }, orderBy: { updatedAt: 'desc' } })
  if (!tokenRow?.token) {
    return NextResponse.json({ detail: 'Vercel token not configured' }, { status: 401 })
  }
  const vercelConn = await (prisma as any).projectServiceConnection.findFirst({ where: { projectId, provider: 'vercel' } })
  if (!vercelConn) {
    return NextResponse.json({ detail: 'Vercel project not connected' }, { status: 400 })
  }
  const githubConn = await (prisma as any).projectServiceConnection.findFirst({ where: { projectId, provider: 'github' } })
  if (!githubConn) {
    return NextResponse.json({ detail: 'GitHub repository not connected' }, { status: 400 })
  }

  // 3) 브랜치 결정 로직 (GitHub 연결 정보 우선)
  const ghData = (() => { try { return githubConn.serviceData ? JSON.parse(githubConn.serviceData) : {} } catch { return {} } })()
  const preferredBranch = body.branch || ghData.last_pushed_branch || ghData.default_branch || 'main'

  // 4) 배포 생성 (services-vercel이 모니터링 시작까지 처리)
  const res = await createDeployment(projectId, preferredBranch)
  if (!res.success || !res.deployment) {
    const msg = res.message || 'Failed to create deployment'
    const status = /token|auth|unauthorized/i.test(msg) ? 401 : 500
    return NextResponse.json({ success: false, message: msg }, { status })
  }

  // 5) Vercel 연결의 serviceData 즉시 갱신(FastAPI와 동일한 메타 유지)
  try {
    const serviceData = (() => { try { return vercelConn.serviceData ? JSON.parse(vercelConn.serviceData) : {} } catch { return {} } })()
    const depUrl = String(res.deployment.url || '')
    const canonicalUrl = depUrl.startsWith('http') ? depUrl : (depUrl ? `https://${depUrl}` : depUrl)

    serviceData.last_deployment_id = res.deployment.id
    serviceData.last_deployment_url = canonicalUrl
    if (!serviceData.deployment_url) serviceData.deployment_url = canonicalUrl
    serviceData.current_deployment = {
      deployment_id: res.deployment.id,
      status: res.deployment.state || 'CREATED',
      deployment_url: res.deployment.url,
      started_at: new Date().toISOString()
    }
    await (prisma as any).projectServiceConnection.update({ where: { id: vercelConn.id }, data: { serviceData: JSON.stringify(serviceData), updatedAt: new Date() } })
  } catch {}

  return NextResponse.json({
    success: true,
    deployment_url: res.deployment.url?.startsWith('http') ? res.deployment.url : `https://${res.deployment.url}`,
    deployment_id: res.deployment.id,
    status: res.deployment.state || 'CREATED',
    message: res.message || 'Deployment created successfully!'
  })
}
