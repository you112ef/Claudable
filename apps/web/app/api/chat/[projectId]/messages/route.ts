import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'
import { handleCors } from '@/lib/cors'
import { spawn } from 'child_process'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
      request_id: msg.requestId || undefined,
      project_id: msg.projectId,
      session_id: msg.sessionId || undefined,
      content: msg.content,
      role: msg.role,
      message_type: msg.type, // align with UI expectation
      status: msg.status || undefined,
      error_message: msg.errorMessage || undefined,
      parent_message_id: msg.parentMessageId || undefined,
      metadata_json: msg.metadata ? JSON.parse(msg.metadata) : null, // align with UI key
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

    // Use Python runner for real-time updates (align with main logic)
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { cliType: true, cliModel: true } })
    const cli: 'claude' | 'cursor' = (project?.cliType as any) === 'cursor' ? 'cursor' : 'claude'
    const model = project?.cliModel || undefined
    const candidates = [
      path.join(process.cwd(), 'py_runner', 'cli_stream.py'),
      path.join(process.cwd(), 'apps', 'web', 'py_runner', 'cli_stream.py')
    ]
    const runnerPath = candidates.find(p => fs.existsSync(p)) || candidates[0]
    const pyArgs = [runnerPath, '--cli', cli, '--instruction', userMessage]
    if (model) pyArgs.push('--model', model)
    console.log('[CLI][messages] Spawning python runner', { runnerPath, cli, model, cwd: process.cwd(), PATH: process.env.PATH?.split(':').slice(0,3) })
    const py = require('child_process').spawn('python3', pyArgs, { shell: false, env: process.env })

    await new Promise<void>((resolve) => {
      let buffer = ''
      py.stdout.on('data', async (data: Buffer) => {
        buffer += data.toString()
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() || ''
        for (const line of lines) {
          const s = line.trim()
          if (!s) continue
          try {
            const obj = JSON.parse(s)
            if (obj.type === 'chunk' && obj.data) {
              const txt = obj.data.text || ''
              fullResponse = obj.data.content || (fullResponse + txt)
              if (global.io) global.io.to(projectId).emit('message_chunk', { type: 'message_chunk', data: { message_id: aiMessage.id, chunk: txt, content: fullResponse } })
            } else if (obj.type === 'complete') {
              fullResponse = obj.data?.text || fullResponse
            } else if (obj.type === 'error') {
              const errMsg = obj.message || 'CLI error'
              await prisma.message.update({ where: { id: aiMessage.id }, data: { content: errMsg, status: 'error', errorMessage: errMsg } })
              if (global.io) {
                global.io.to(projectId).emit('processing_error', { type: 'processing_error', data: { request_id: requestId, message_id: aiMessage.id, error: errMsg } })
                global.io.to(projectId).emit('message_complete', { type: 'message_complete', data: { message_id: aiMessage.id, request_id: requestId, content: errMsg, status: 'error' } })
              }
            }
          } catch {
            fullResponse += s + '\n'
            if (global.io) global.io.to(projectId).emit('message_chunk', { type: 'message_chunk', data: { message_id: aiMessage.id, chunk: s + '\n', content: fullResponse } })
          }
        }
      })
      py.stderr.on('data', (d: Buffer) => {
        const s = d.toString()
        if (s && s.trim()) console.log('[CLI][messages][stderr]', s.slice(0, 400))
      })
      py.on('error', (err: Error) => {
        console.error('[CLI][messages] python spawn error:', err)
      })
      py.on('close', async (code: number) => {
        console.log('[CLI][messages] runner closed with code', code)
        const endTime = Date.now()
        const duration = endTime - startTime
        await prisma.message.update({ where: { id: aiMessage.id }, data: { content: fullResponse, status: 'completed' } })
        await prisma.session.update({ where: { id: sessionId }, data: { durationMs: { increment: duration } } })
        await prisma.userRequest.update({ where: { id: requestId }, data: { status: 'completed', outputData: fullResponse, completedAt: new Date(), durationMs: duration } })
        if (global.io) {
          global.io.to(projectId).emit('message_complete', { type: 'message_complete', data: { message_id: aiMessage.id, request_id: requestId, content: fullResponse, status: 'completed' } })
          global.io.to(projectId).emit('processing_complete', { type: 'processing_complete', data: { request_id: requestId, status: 'completed' } })
        }
        resolve()
      })
    })
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

    // Emit error via WebSocket and finalize
    if (global.io) {
      global.io.to(projectId).emit('processing_error', {
        type: 'processing_error',
        data: {
          request_id: requestId,
          error: error.message
        }
      })
      global.io.to(projectId).emit('message_complete', { type: 'message_complete', data: { message_id: undefined, request_id: requestId, content: String((error as any)?.message || error), status: 'error' } })
    }
  }
}
