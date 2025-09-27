import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'
import { handleCors } from '@/lib/cors'

// OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCors(request) || new NextResponse(null, { status: 200 })
}

// GET /api/services - Get all service connections
export async function GET(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse
  
  try {
    // Mock services data - could be integrated with actual service APIs
    const services = {
      github: {
        connected: false,
        status: 'disconnected',
        last_sync: null
      },
      vercel: {
        connected: false,
        status: 'disconnected',
        last_sync: null
      },
      supabase: {
        connected: false,
        status: 'disconnected',
        last_sync: null
      },
      claude: {
        connected: !!process.env.CLAUDE_API_KEY,
        status: process.env.CLAUDE_API_KEY ? 'connected' : 'disconnected',
        last_sync: new Date().toISOString()
      }
    }

    return successResponse(services)
  } catch (error) {
    console.error('Error fetching services:', error)
    return errorResponse('Failed to fetch services', 500)
  }
}

// POST /api/services - Connect/disconnect a service
export async function POST(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse
  
  try {
    const body = await request.json()
    const { service, action, config } = body
    
    console.log(`Service ${action}: ${service}`, config)
    
    // Mock service connection - in reality would handle OAuth flows, API key validation etc.
    return successResponse({ 
      message: `${service} ${action} successfully`,
      service,
      status: action === 'connect' ? 'connected' : 'disconnected'
    })
  } catch (error) {
    console.error('Error updating service:', error)
    return errorResponse('Failed to update service', 500)
  }
}