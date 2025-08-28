import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'
import { handleCors } from '@/lib/cors'

interface RouteParams {
  params: {
    provider: string
  }
}

interface TokenResponse {
  id: string
  provider: string
  name: string
  created_at: Date
  last_used?: Date
}

// OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCors(request) || new NextResponse(null, { status: 200 })
}

// GET /api/tokens/[provider] - Get service token by provider
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { provider } = params
    const { searchParams } = new URL(request.url)
    const internal = searchParams.get('internal') === 'true'

    // Validate provider
    if (!['github', 'supabase', 'vercel'].includes(provider)) {
      return errorResponse('Invalid provider', 400)
    }

    const serviceToken = await prisma.token.findUnique({
      where: { serviceName: provider }
    })

    if (!serviceToken) {
      return errorResponse('Token not found', 404)
    }

    // If internal request, return the actual token for service integrations
    if (internal) {
      // Update last used timestamp
      await prisma.token.update({
        where: { id: serviceToken.id },
        data: { updatedAt: new Date() }
      })

      return successResponse({ token: serviceToken.accessToken })
    }

    // Regular request, return token metadata only
    const response: TokenResponse = {
      id: serviceToken.id,
      provider: serviceToken.serviceName,
      name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} Token`,
      created_at: serviceToken.createdAt,
      last_used: serviceToken.updatedAt
    }

    return successResponse(response)
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

// DELETE /api/tokens/[provider] - Delete a service token
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { provider } = params

    // Validate provider
    if (!['github', 'supabase', 'vercel'].includes(provider)) {
      return errorResponse('Invalid provider', 400)
    }

    const deletedToken = await prisma.token.deleteMany({
      where: { serviceName: provider }
    })

    if (deletedToken.count === 0) {
      return errorResponse('Token not found', 404)
    }

    return successResponse({ message: 'Token deleted successfully' })
  } catch (error) {
    console.error('Error deleting token:', error)
    return errorResponse('Failed to delete token', 500)
  }
}