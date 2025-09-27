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

// GET /api/projects/[projectId]/services - Get project service connections
export async function GET(request: NextRequest, { params }: RouteParams) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse
  
  try {
    const projectServices = await prisma.projectService.findMany({
      where: { projectId: params.projectId }
    })

    const services = {
      github: { connected: false, status: 'disconnected', last_sync: null },
      vercel: { connected: false, status: 'disconnected', last_sync: null },
      supabase: { connected: false, status: 'disconnected', last_sync: null }
    }

    // Update with actual service data
    projectServices.forEach(service => {
      const config = JSON.parse(service.connectionData || '{}')
      services[service.serviceName] = {
        connected: service.isActive,
        status: service.isActive ? 'connected' : 'disconnected',
        last_sync: service.updatedAt
      }
    })

    return successResponse(services)
  } catch (error) {
    console.error('Error fetching project services:', error)
    return errorResponse('Failed to fetch project services', 500)
  }
}

// POST /api/projects/[projectId]/services - Connect/disconnect project service
export async function POST(request: NextRequest, { params }: RouteParams) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse
  
  try {
    const body = await request.json()
    const { service, action, config = {} } = body
    
    if (!['github', 'vercel', 'supabase'].includes(service)) {
      return errorResponse('Invalid service name', 400)
    }

    if (!['connect', 'disconnect'].includes(action)) {
      return errorResponse('Invalid action', 400)
    }

    if (action === 'connect') {
      // Create or update service connection
      await prisma.projectService.upsert({
        where: {
          projectId_serviceName: {
            projectId: params.projectId,
            serviceName: service
          }
        },
        update: {
          connectionData: JSON.stringify(config),
          isActive: true,
          updatedAt: new Date()
        },
        create: {
          projectId: params.projectId,
          serviceName: service,
          connectionData: JSON.stringify(config),
          isActive: true
        }
      })
    } else {
      // Disconnect service
      await prisma.projectService.updateMany({
        where: {
          projectId: params.projectId,
          serviceName: service
        },
        data: {
          isActive: false,
          updatedAt: new Date()
        }
      })
    }

    return successResponse({
      message: `${service} ${action}ed successfully`,
      service,
      status: action === 'connect' ? 'connected' : 'disconnected'
    })
  } catch (error) {
    console.error('Error updating project service:', error)
    return errorResponse('Failed to update project service', 500)
  }
}