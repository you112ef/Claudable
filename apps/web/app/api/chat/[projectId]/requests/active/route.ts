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

// GET /api/chat/[projectId]/requests/active - Get active chat requests
export async function GET(request: NextRequest, { params }: RouteParams) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse
  
  try {
    const activeRequests = await prisma.userRequest.findMany({
      where: {
        projectId: params.projectId,
        status: {
          in: ['pending', 'processing']
        }
      },
      orderBy: { startedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    })

    const formattedRequests = activeRequests.map(req => ({
      id: req.id,
      project_id: req.projectId,
      request_type: req.requestType,
      status: req.status,
      input_data: req.inputData,
      output_data: req.outputData,
      error_message: req.errorMessage,
      started_at: req.startedAt,
      completed_at: req.completedAt,
      duration_ms: req.durationMs,
      latest_message: req.messages[0] ? {
        id: req.messages[0].id,
        role: req.messages[0].role,
        content: req.messages[0].content,
        type: req.messages[0].type,
        created_at: req.messages[0].createdAt
      } : null
    }))

    return successResponse(formattedRequests)
  } catch (error) {
    console.error('Error fetching active requests:', error)
    return errorResponse('Failed to fetch active requests', 500)
  }
}