import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'
import { handleCors } from '@/lib/cors'

interface RouteParams {
  params: {
    provider: string
  }
}

// OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCors(request) || new NextResponse(null, { status: 200 })
}

// GET /api/tokens/[provider] - Get token for provider
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const token = await prisma.token.findUnique({
      where: { serviceName: params.provider }
    })

    if (!token) {
      return successResponse({ exists: false })
    }

    return successResponse({
      exists: true,
      service_name: token.serviceName,
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
      expires_at: token.expiresAt,
      created_at: token.createdAt,
      updated_at: token.updatedAt
    })
  } catch (error) {
    console.error('Error fetching token:', error)
    return errorResponse('Failed to fetch token', 500)
  }
}

// POST /api/tokens/[provider] - Create or update token
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json()
    const { access_token, refresh_token, expires_at } = body

    if (!access_token) {
      return errorResponse('Access token is required', 400)
    }

    // Check if token exists
    const existing = await prisma.token.findUnique({
      where: { serviceName: params.provider }
    })

    let token
    if (existing) {
      // Update existing
      token = await prisma.token.update({
        where: { id: existing.id },
        data: {
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt: expires_at ? new Date(expires_at) : null
        }
      })
    } else {
      // Create new
      token = await prisma.token.create({
        data: {
          serviceName: params.provider,
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt: expires_at ? new Date(expires_at) : null
        }
      })
    }

    return successResponse({
      service_name: token.serviceName,
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
      expires_at: token.expiresAt,
      created_at: token.createdAt,
      updated_at: token.updatedAt
    }, existing ? 200 : 201)
  } catch (error) {
    console.error('Error creating/updating token:', error)
    return errorResponse('Failed to create/update token', 500)
  }
}

// DELETE /api/tokens/[provider] - Delete token
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const token = await prisma.token.findUnique({
      where: { serviceName: params.provider }
    })

    if (!token) {
      return errorResponse('Token not found', 404)
    }

    await prisma.token.delete({
      where: { id: token.id }
    })

    return successResponse({ message: 'Token deleted successfully' })
  } catch (error) {
    console.error('Error deleting token:', error)
    return errorResponse('Failed to delete token', 500)
  }
}