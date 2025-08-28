import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'
import { handleCors } from '@/lib/cors'
import { claudeService } from '@/lib/claude'

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

    // If this is a user message, process AI response via WebSocket
    if (role === 'user' && requestId) {
      // Emit to WebSocket for real-time processing
      if (global.io) {
        global.io.to(params.projectId).emit('processing_started', {
          type: 'processing_started',
          data: {
            request_id: requestId,
            message_id: message.id,
            status: 'processing'
          }
        })

        // Process AI response asynchronously
        setImmediate(async () => {
          try {
            await processAIResponse(params.projectId, sessionId, requestId, content, message.id)
          } catch (error) {
            console.error('Error processing AI response:', error)
            // Update user request as failed
            await prisma.userRequest.update({
              where: { id: requestId },
              data: { 
                status: 'failed',
                errorMessage: error.message,
                completedAt: new Date()
              }
            })
            
            if (global.io) {
              global.io.to(params.projectId).emit('processing_error', {
                type: 'processing_error',
                data: {
                  request_id: requestId,
                  error: error.message
                }
              })
            }
          }
        })
      }
    }

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

// Process AI response with real Claude API integration
async function processAIResponse(projectId: string, sessionId: string, requestId: string, userMessage: string, userMessageId: string) {
  const startTime = Date.now()

  // Update request status
  await prisma.userRequest.update({
    where: { id: requestId },
    data: { status: 'processing' }
  })

  try {
    // Create placeholder AI message for streaming updates
    const aiMessage = await prisma.message.create({
      data: {
        requestId,
        sessionId,
        projectId,
        role: 'assistant',
        content: '',
        type: 'text',
        status: 'streaming',
        parentMessageId: userMessageId
      }
    })

    let fullResponse = ''
    let totalInputTokens = 0
    let totalOutputTokens = 0

    // Use streaming response for real-time updates
    await claudeService.generateStreamingResponse(
      projectId,
      sessionId,
      userMessage,
      // onChunk - stream partial responses via WebSocket
      (chunk: string) => {
        fullResponse += chunk
        
        if (global.io) {
          global.io.to(projectId).emit('message_chunk', {
            type: 'message_chunk',
            data: {
              message_id: aiMessage.id,
              chunk,
              content: fullResponse
            }
          })
        }
      },
      // onComplete - finalize the response
      async (finalResponse: string, usage?: any) => {
        const endTime = Date.now()
        const duration = endTime - startTime

        if (usage) {
          totalInputTokens = usage.input_tokens || 0
          totalOutputTokens = usage.output_tokens || 0
        }

        // Update the AI message with final content
        await prisma.message.update({
          where: { id: aiMessage.id },
          data: { 
            content: finalResponse,
            status: 'completed'
          }
        })

        // Update session token usage
        await prisma.session.update({
          where: { id: sessionId },
          data: {
            totalTokens: { increment: totalInputTokens + totalOutputTokens },
            promptTokens: { increment: totalInputTokens },
            completionTokens: { increment: totalOutputTokens },
            durationMs: { increment: duration }
          }
        })

        // Update request as completed
        await prisma.userRequest.update({
          where: { id: requestId },
          data: { 
            status: 'completed',
            outputData: finalResponse,
            completedAt: new Date(),
            durationMs: duration
          }
        })

        // Emit completion via WebSocket
        if (global.io) {
          global.io.to(projectId).emit('message_complete', {
            type: 'message_complete',
            data: {
              message_id: aiMessage.id,
              request_id: requestId,
              content: finalResponse,
              status: 'completed',
              tokens: {
                input: totalInputTokens,
                output: totalOutputTokens,
                total: totalInputTokens + totalOutputTokens
              },
              duration_ms: duration
            }
          })

          global.io.to(projectId).emit('processing_complete', {
            type: 'processing_complete',
            data: {
              request_id: requestId,
              status: 'completed'
            }
          })
        }
      },
      // onError - handle errors
      async (error: Error) => {
        const endTime = Date.now()
        const duration = endTime - startTime

        console.error('Claude API error:', error)

        // Update AI message with error status
        await prisma.message.update({
          where: { id: aiMessage.id },
          data: { 
            content: 'I apologize, but I encountered an error while processing your request. Please try again.',
            status: 'error',
            errorMessage: error.message
          }
        })

        // Update request as failed
        await prisma.userRequest.update({
          where: { id: requestId },
          data: { 
            status: 'failed',
            errorMessage: error.message,
            completedAt: new Date(),
            durationMs: duration
          }
        })

        // Emit error via WebSocket
        if (global.io) {
          global.io.to(projectId).emit('processing_error', {
            type: 'processing_error',
            data: {
              request_id: requestId,
              message_id: aiMessage.id,
              error: error.message
            }
          })
        }
      }
    )
  } catch (error) {
    const endTime = Date.now()
    const duration = endTime - startTime

    console.error('Error in processAIResponse:', error)
    
    // Update request as failed
    await prisma.userRequest.update({
      where: { id: requestId },
      data: { 
        status: 'failed',
        errorMessage: error.message,
        completedAt: new Date(),
        durationMs: duration
      }
    })

    // Emit error via WebSocket
    if (global.io) {
      global.io.to(projectId).emit('processing_error', {
        type: 'processing_error',
        data: {
          request_id: requestId,
          error: error.message
        }
      })
    }
  }
}