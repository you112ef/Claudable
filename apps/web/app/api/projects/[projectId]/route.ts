import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'
import { handleCors } from '@/lib/cors'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import path from 'path'
import fs from 'fs/promises'

interface RouteParams {
  params: {
    projectId: string
  }
}

// OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCors(request) || new NextResponse(null, { status: 200 })
}

// GET /api/projects/[projectId] - Get single project
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' }
        },
        projectServices: true
      }
    })

    if (!project) {
      return errorResponse('Project not found', 404)
    }

    const projectWithMetadata = {
      id: project.id,
      name: project.name,
      path: project.path,
      cli_type: project.cliType,
      cli_model: project.cliModel,
      status: project.status,
      port: project.port,
      framework: project.framework,
      github_repo_url: project.githubRepoUrl,
      github_branch: project.githubBranch,
      vercel_project_id: project.vercelProjectId,
      system_prompt: project.systemPrompt,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
      last_opened_at: project.lastOpenedAt,
      last_message_at: project.messages[0]?.createdAt || null,
      services: project.projectServices.reduce((acc, service) => {
        acc[service.serviceName] = {
          connected: service.isActive,
          configuration: JSON.parse(service.connectionData || '{}')
        }
        return acc
      }, {} as Record<string, any>)
    }

    return successResponse(projectWithMetadata)
  } catch (error) {
    console.error('Error fetching project:', error)
    return errorResponse('Failed to fetch project', 500)
  }
}

// PUT /api/projects/[projectId] - Update project
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json()
    const { name } = body

    const project = await prisma.project.update({
      where: { id: params.projectId },
      data: { name }
    })

    return successResponse({
      id: project.id,
      name: project.name,
      updated_at: project.updatedAt
    })
  } catch (error) {
    console.error('Error updating project:', error)
    return errorResponse('Failed to update project', 500)
  }
}

// DELETE /api/projects/[projectId] - Delete project
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: params.projectId }
    })

    if (!project) {
      return errorResponse('Project not found', 404)
    }

    // Delete project directory
    const projectPath = path.join(process.cwd(), '..', '..', 'data', 'projects', params.projectId)
    try {
      await fs.rm(projectPath, { recursive: true, force: true })
    } catch (error) {
      console.error('Error deleting project directory:', error)
    }

    // Delete from database (cascades to related records)
    await prisma.project.delete({
      where: { id: params.projectId }
    })

    return successResponse({ message: 'Project deleted successfully' })
  } catch (error) {
    console.error('Error deleting project:', error)
    return errorResponse('Failed to delete project', 500)
  }
}
