import { NextRequest, NextResponse } from 'next/server'
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

// POST /api/[projectId]/install-dependencies - Install project dependencies
export async function POST(request: NextRequest, { params }: RouteParams) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse
  
  try {
    let body = {}
    try {
      body = await request.json()
    } catch (error) {
      // Handle empty body case
      console.log('No JSON body provided, using defaults')
    }
    const { dependencies = [], dev_dependencies = [] } = body
    
    console.log(`Installing dependencies for project ${params.projectId}:`, {
      dependencies,
      dev_dependencies
    })
    
    // Mock dependency installation - in reality would:
    // 1. Read project's package.json
    // 2. Add dependencies
    // 3. Run npm install
    // 4. Emit progress via WebSocket
    
    // Simulate installation time
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Emit WebSocket event for real-time updates
    if (global.io) {
      global.io.to(params.projectId).emit('dependencies_installed', {
        type: 'dependencies_installed',
        data: {
          dependencies,
          dev_dependencies,
          status: 'completed'
        }
      })
    }
    
    return successResponse({
      message: 'Dependencies installed successfully',
      dependencies,
      dev_dependencies
    })
  } catch (error) {
    console.error('Error installing dependencies:', error)
    
    if (global.io) {
      global.io.to(params.projectId).emit('dependencies_error', {
        type: 'dependencies_error',
        data: {
          error: error.message
        }
      })
    }
    
    return errorResponse('Failed to install dependencies', 500)
  }
}