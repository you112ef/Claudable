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

// POST /api/[projectId]/act - Execute an action/command in the project
export async function POST(request: NextRequest, { params }: RouteParams) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse
  
  try {
    const body = await request.json()
    // Support both original FastAPI format (instruction) and new format (action/command)
    const { action, command, instruction, parameters = {} } = body
    
    let finalAction = action
    let finalCommand = command
    
    // If instruction is provided (original format), parse it
    if (instruction && !action && !command) {
      finalAction = 'execute'
      finalCommand = instruction
    }
    
    if (!finalAction || !finalCommand) {
      return errorResponse('Action and command are required (or instruction)', 400)
    }
    
    console.log(`Action requested for project ${params.projectId}:`, {
      finalAction,
      finalCommand,
      parameters
    })
    
    // Create user request for tracking
    const userRequest = await prisma.userRequest.create({
      data: {
        projectId: params.projectId,
        requestType: 'action',
        inputData: JSON.stringify({ action: finalAction, command: finalCommand, parameters }),
        status: 'processing'
      }
    })
    
    // Emit WebSocket event for real-time updates
    if (global.io) {
      global.io.to(params.projectId).emit('action_started', {
        type: 'action_started',
        data: {
          request_id: userRequest.id,
          action: finalAction,
          command: finalCommand,
          status: 'processing'
        }
      })
    }
    
    // Mock action execution - in reality would:
    // 1. Execute shell commands
    // 2. File operations
    // 3. Code generation
    // 4. API calls
    // 5. Stream results via WebSocket
    
    // Simulate processing time
    setImmediate(async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 3000))
        
        // Mock successful result
        const result = {
          action: finalAction,
          command: finalCommand,
          output: `Mock execution of "${finalCommand}" completed successfully`,
          files_changed: [],
          exit_code: 0
        }
        
        // Update request as completed
        await prisma.userRequest.update({
          where: { id: userRequest.id },
          data: { 
            status: 'completed',
            outputData: JSON.stringify(result),
            completedAt: new Date()
          }
        })
        
        // Emit completion via WebSocket
        if (global.io) {
          global.io.to(params.projectId).emit('action_complete', {
            type: 'action_complete',
            data: {
              request_id: userRequest.id,
              ...result,
              status: 'completed'
            }
          })
        }
      } catch (error) {
        // Update request as failed
        await prisma.userRequest.update({
          where: { id: userRequest.id },
          data: { 
            status: 'failed',
            errorMessage: error.message,
            completedAt: new Date()
          }
        })
        
        // Emit error via WebSocket
        if (global.io) {
          global.io.to(params.projectId).emit('action_error', {
            type: 'action_error',
            data: {
              request_id: userRequest.id,
              error: error.message
            }
          })
        }
      }
    })
    
    return successResponse({
      request_id: userRequest.id,
      action: finalAction,
      command: finalCommand,
      status: 'processing',
      message: 'Action started'
    })
  } catch (error) {
    console.error('Error executing action:', error)
    return errorResponse('Failed to execute action', 500)
  }
}