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

// GET /api/projects/[projectId]/vercel/deployment/current - Get current Vercel deployment status
export async function GET(request: NextRequest, { params }: RouteParams) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse
  
  try {
    // Mock deployment status - in reality would call Vercel API
    const deploymentStatus = {
      deployment_id: null,
      status: 'not_deployed',
      url: null,
      created_at: null,
      updated_at: null,
      logs: [],
      error: null
    }
    
    // Check if Vercel is connected for this project
    // In a real implementation, you'd check project services and make Vercel API calls
    
    return successResponse({
      project_id: params.projectId,
      deployment: deploymentStatus,
      message: 'No active deployment found'
    })
  } catch (error) {
    console.error('Error fetching deployment status:', error)
    return errorResponse('Failed to fetch deployment status', 500)
  }
}