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

// GET /api/chat/[projectId]/messages - Get messages for a project
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('session_id')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const whereClause: any = {
      projectId: params.projectId
    }

    if (sessionId) {
      whereClause.sessionId = sessionId
    }

    const messages = await prisma.message.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        userRequest: true
      }
    })

    const formattedMessages = messages.map(msg => ({
      id: msg.id,
      request_id: msg.requestId,
      project_id: msg.projectId,
      session_id: msg.sessionId,
      content: msg.content,
      role: msg.role,
      type: msg.type,
      status: msg.status,
      error_message: msg.errorMessage,
      parent_message_id: msg.parentMessageId,
      metadata: msg.metadata ? JSON.parse(msg.metadata) : null,
      created_at: msg.createdAt,
      updated_at: msg.updatedAt,
      user_request: msg.userRequest ? {
        id: msg.userRequest.id,
        status: msg.userRequest.status,
        error_message: msg.userRequest.errorMessage
      } : null
    }))

    return successResponse(formattedMessages.reverse())
  } catch (error) {
    console.error('Error fetching messages:', error)
    return errorResponse('Failed to fetch messages', 500)
  }
}

// POST /api/chat/[projectId]/messages - Create a new message
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json()
    const { content, role = 'user', session_id, type = 'text', metadata } = body

    // Get or create session
    let sessionId = session_id
    if (!sessionId) {
      const activeSession = await prisma.session.findFirst({
        where: {
          projectId: params.projectId
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      if (activeSession) {
        sessionId = activeSession.id
      } else {
        const newSession = await prisma.session.create({
          data: {
            projectId: params.projectId,
            sessionExternalId: `session-${Date.now()}`,
            model: 'claude-sonnet-4'
          }
        })
        sessionId = newSession.id
      }
    }

    // Create user request first if this is a user message
    let requestId = null
    if (role === 'user') {
      const userRequest = await prisma.userRequest.create({
        data: {
          projectId: params.projectId,
          requestType: 'chat',
          inputData: content,
          status: 'pending'
        }
      })
      requestId = userRequest.id
    }

    const message = await prisma.message.create({
      data: {
        requestId,
        sessionId,
        projectId: params.projectId,
        role,
        content,
        type,
        metadata: metadata ? JSON.stringify(metadata) : null
      }
    })

    return successResponse({
      id: message.id,
      request_id: message.requestId,
      session_id: message.sessionId,
      project_id: message.projectId,
      role: message.role,
      content: message.content,
      type: message.type,
      metadata: metadata,
      created_at: message.createdAt,
      updated_at: message.updatedAt
    }, 201)
  } catch (error) {
    console.error('Error creating message:', error)
    return errorResponse('Failed to create message', 500)
  }
}