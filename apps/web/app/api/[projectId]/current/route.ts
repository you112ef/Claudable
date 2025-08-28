import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'
import { handleCors } from '@/lib/cors'

interface RouteParams {
  params: {
    projectId: string
  }
}

// OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCors(request) || new NextResponse(null, { status: 200 })
}

// GET /api/[projectId]/current - Get current project state
export async function GET(request: NextRequest, { params }: RouteParams) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse
  
  try {
    // Get project from database
    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      include: {
        sessions: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        userRequests: {
          where: {
            status: {
              in: ['pending', 'processing']
            }
          },
          orderBy: { startedAt: 'desc' }
        }
      }
    })
    
    if (!project) {
      return errorResponse('Project not found', 404)
    }
    
    const currentState = {
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
        framework: project.framework,
        last_opened_at: project.lastOpenedAt
      },
      session: project.sessions[0] ? {
        id: project.sessions[0].id,
        model: project.sessions[0].model,
        total_tokens: project.sessions[0].totalTokens,
        created_at: project.sessions[0].createdAt
      } : null,
      active_requests: project.userRequests.map(req => ({
        id: req.id,
        type: req.requestType,
        status: req.status,
        started_at: req.startedAt
      })),
      recent_messages: project.messages.slice(0, 5).map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content.substring(0, 100) + '...',
        created_at: msg.createdAt
      })),
      stats: {
        total_messages: project.messages.length,
        active_requests: project.userRequests.length
      }
    }
    
    return successResponse(currentState)
  } catch (error) {
    console.error('Error fetching current state:', error)
    return errorResponse('Failed to fetch current state', 500)
  }
}