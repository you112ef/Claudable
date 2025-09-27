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

// GET /api/services/[projectId] - Get services for project
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const services = await prisma.projectService.findMany({
      where: { projectId: params.projectId },
      orderBy: { createdAt: 'desc' }
    })

    const formattedServices = services.map(service => ({
      id: service.id,
      project_id: service.projectId,
      service_name: service.serviceName,
      connection_data: JSON.parse(service.connectionData),
      is_active: service.isActive,
      created_at: service.createdAt,
      updated_at: service.updatedAt
    }))

    return successResponse(formattedServices)
  } catch (error) {
    console.error('Error fetching services:', error)
    return errorResponse('Failed to fetch services', 500)
  }
}

// POST /api/services/[projectId] - Add service to project
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json()
    const { service_name, connection_data } = body

    if (!service_name) {
      return errorResponse('Service name is required', 400)
    }

    // Check if service already exists
    const existing = await prisma.projectService.findUnique({
      where: {
        projectId_serviceName: {
          projectId: params.projectId,
          serviceName: service_name
        }
      }
    })

    if (existing) {
      return errorResponse('Service already exists', 409)
    }

    const service = await prisma.projectService.create({
      data: {
        projectId: params.projectId,
        serviceName: service_name,
        connectionData: JSON.stringify(connection_data || {}),
        isActive: true
      }
    })

    return successResponse({
      id: service.id,
      project_id: service.projectId,
      service_name: service.serviceName,
      connection_data: connection_data || {},
      is_active: service.isActive,
      created_at: service.createdAt,
      updated_at: service.updatedAt
    }, 201)
  } catch (error) {
    console.error('Error adding service:', error)
    return errorResponse('Failed to add service', 500)
  }
}

// PUT /api/services/[projectId] - Update service configuration
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json()
    const { service_id, connection_data, is_active } = body

    if (!service_id) {
      return errorResponse('Service ID is required', 400)
    }

    const service = await prisma.projectService.findFirst({
      where: {
        id: service_id,
        projectId: params.projectId
      }
    })

    if (!service) {
      return errorResponse('Service not found', 404)
    }

    const updated = await prisma.projectService.update({
      where: { id: service.id },
      data: {
        connectionData: connection_data ? JSON.stringify(connection_data) : service.connectionData,
        isActive: is_active !== undefined ? is_active : service.isActive
      }
    })

    return successResponse({
      id: updated.id,
      project_id: updated.projectId,
      service_name: updated.serviceName,
      connection_data: JSON.parse(updated.connectionData),
      is_active: updated.isActive,
      created_at: updated.createdAt,
      updated_at: updated.updatedAt
    })
  } catch (error) {
    console.error('Error updating service:', error)
    return errorResponse('Failed to update service', 500)
  }
}

// DELETE /api/services/[projectId] - Remove service from project
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { searchParams } = new URL(request.url)
    const serviceId = searchParams.get('service_id')

    if (!serviceId) {
      return errorResponse('Service ID is required', 400)
    }

    const service = await prisma.projectService.findFirst({
      where: {
        id: serviceId,
        projectId: params.projectId
      }
    })

    if (!service) {
      return errorResponse('Service not found', 404)
    }

    await prisma.projectService.delete({
      where: { id: service.id }
    })

    return successResponse({ message: 'Service removed successfully' })
  } catch (error) {
    console.error('Error removing service:', error)
    return errorResponse('Failed to remove service', 500)
  }
}