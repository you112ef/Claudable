import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'
import { handleCors } from '@/lib/cors'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs/promises'

// OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCors(request) || new NextResponse(null, { status: 200 })
}

// GET /api/projects - Get all projects
export async function GET(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse
  try {
    const projects = await prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' }
        },
        projectServices: true
      }
    })

    const projectsWithMetadata = projects.map(project => ({
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
    }))

    return successResponse(projectsWithMetadata)
  } catch (error) {
    console.error('Error fetching projects:', error)
    return errorResponse('Failed to fetch projects', 500)
  }
}

// POST /api/projects - Create new project
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('POST /api/projects - Request body:', body)
    
    // Support both old and new field names for compatibility
    const project_id = body.project_id
    const name = body.name || body.project_name
    const initial_prompt = body.initial_prompt || body.description
    const preferred_cli = body.preferred_cli || body.cli_preference || 'claude'
    const selected_model = body.selected_model || body.cli_model
    const fallback_enabled = body.fallback_enabled !== undefined ? body.fallback_enabled : true
    const cli_settings = body.cli_settings
    const template = body.template

    // Validate required fields
    if (!project_id || !name) {
      return errorResponse('Project ID and name are required', 400)
    }

    // Validate project ID format
    if (!/^[a-z0-9-]{3,}$/.test(project_id)) {
      return errorResponse('Invalid project ID format', 400)
    }

    // Check if project already exists
    const existingProject = await prisma.project.findUnique({
      where: { id: project_id }
    })

    if (existingProject) {
      return errorResponse('Project with this ID already exists', 409)
    }

    // Create project directory
    const projectPath = path.join(process.cwd(), '..', '..', 'data', 'projects', project_id)
    await fs.mkdir(projectPath, { recursive: true })

    // Create project in database
    const project = await prisma.project.create({
      data: {
        id: project_id,
        name,
        path: projectPath,
        cliType: preferred_cli || 'claude',
        cliModel: selected_model,
        systemPrompt: initial_prompt
      }
    })

    // Initialize session if initial_prompt provided (message hidden from UI; ACT/CHAT will stream separately)
    if (initial_prompt) {
      const session = await prisma.session.create({
        data: {
          projectId: project.id,
          sessionExternalId: `session-${Date.now()}`,
          model: selected_model || preferred_cli || 'claude-sonnet-4'
        }
      })

      await prisma.message.create({
        data: {
          sessionId: session.id,
          projectId: project.id,
          role: 'user',
          content: initial_prompt,
          type: 'initial_prompt',
          metadata: JSON.stringify({ hidden_from_ui: true })
        }
      })
    }

    return successResponse({
      id: project.id,
      name: project.name,
      path: project.path,
      cli_type: project.cliType,
      cli_model: project.cliModel,
      status: project.status,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
      last_opened_at: project.lastOpenedAt,
      system_prompt: project.systemPrompt,
      services: {}
    }, 201)
  } catch (error: any) {
    console.error('Error creating project:', error)
    console.error('Error details:', error.message, error.stack)
    return errorResponse(error.message || 'Failed to create project', 500)
  }
}
// Ensure Node.js runtime (required for fs/prisma)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
