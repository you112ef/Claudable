import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'
import { handleCors } from '@/lib/cors'
import crypto from 'crypto'

interface TokenCreate {
  provider: string
  token: string
  name?: string
}

interface TokenResponse {
  id: string
  provider: string
  name: string
  created_at: Date
  last_used?: Date
}

// Simple encryption for tokens (use proper key management in production)
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || 'default-key-change-in-production'

function encryptToken(token: string): string {
  const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY)
  let encrypted = cipher.update(token, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return encrypted
}

function decryptToken(encryptedToken: string): string {
  try {
    const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY)
    let decrypted = decipher.update(encryptedToken, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    // If decryption fails, assume it's already decrypted (backward compatibility)
    return encryptedToken
  }
}

// OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCors(request) || new NextResponse(null, { status: 200 })
}

// GET /api/tokens - Get all tokens (for management)
export async function GET(request: NextRequest) {
  try {
    // Get all tokens (without the actual token values for security)
    const tokens = await prisma.token.findMany({
      orderBy: { createdAt: 'desc' }
    })

    const response: TokenResponse[] = tokens.map(token => ({
      id: token.id,
      provider: token.serviceName,
      name: `${token.serviceName.charAt(0).toUpperCase() + token.serviceName.slice(1)} Token`,
      created_at: token.createdAt,
      last_used: token.updatedAt
    }))

    return successResponse(response)
  } catch (error) {
    console.error('Error fetching tokens:', error)
    return errorResponse('Failed to fetch tokens', 500)
  }
}

// POST /api/tokens - Save a new service token
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { provider, token, name }: TokenCreate = body

    // Validate provider
    if (!['github', 'supabase', 'vercel'].includes(provider)) {
      return errorResponse('Invalid provider', 400)
    }

    // Validate token
    if (!token || !token.trim()) {
      return errorResponse('Token cannot be empty', 400)
    }

    // Store the token as-is (encryption can be added later if needed)
    const tokenValue = token.trim()
    const tokenName = name?.trim() || `${provider.charAt(0).toUpperCase() + provider.slice(1)} Token`

    // Save or update the service token
    const serviceToken = await prisma.token.upsert({
      where: { serviceName: provider },
      update: {
        accessToken: tokenValue,
        updatedAt: new Date()
      },
      create: {
        serviceName: provider,
        accessToken: tokenValue
      }
    })

    const response: TokenResponse = {
      id: serviceToken.id,
      provider: serviceToken.serviceName,
      name: tokenName,
      created_at: serviceToken.createdAt,
      last_used: serviceToken.updatedAt
    }

    return successResponse(response, 201)
  } catch (error) {
    console.error('Error saving token:', error)
    return errorResponse('Failed to save token', 500)
  }
}