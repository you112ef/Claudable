import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'
import { handleCors } from '@/lib/cors'

// OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCors(request) || new NextResponse(null, { status: 200 })
}

// GET /api/settings - Get global settings
export async function GET(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse
  
  try {
    // Get stored API keys from database
    const tokens = await prisma.token.findMany({
      select: {
        serviceName: true,
        accessToken: true
      }
    })

    const tokenMap = {}
    tokens.forEach(token => {
      tokenMap[`${token.serviceName}_api_key`] = token.accessToken ? '***hidden***' : null
    })

    const settings = {
      theme: 'dark',
      language: 'en',
      notifications: true,
      auto_save: true,
      claude_api_key: tokenMap.claude_api_key || (process.env.CLAUDE_API_KEY ? '***hidden***' : null),
      anthropic_api_key: tokenMap.anthropic_api_key || (process.env.ANTHROPIC_API_KEY ? '***hidden***' : null),
      openai_api_key: tokenMap.openai_api_key || (process.env.OPENAI_API_KEY ? '***hidden***' : null)
    }

    return successResponse(settings)
  } catch (error) {
    console.error('Error fetching settings:', error)
    return errorResponse('Failed to fetch settings', 500)
  }
}

// POST/PUT /api/settings - Update settings
export async function POST(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse
  
  try {
    const body = await request.json()
    
    // Handle API key updates
    const updates = []
    
    if (body.claude_api_key !== undefined) {
      if (body.claude_api_key) {
        await prisma.token.upsert({
          where: { serviceName: 'claude' },
          update: { 
            accessToken: body.claude_api_key,
            updatedAt: new Date()
          },
          create: {
            serviceName: 'claude',
            accessToken: body.claude_api_key
          }
        })
        updates.push('Claude API key')
      } else {
        // Remove if empty string
        await prisma.token.deleteMany({
          where: { serviceName: 'claude' }
        })
        updates.push('Claude API key (removed)')
      }
    }
    
    if (body.anthropic_api_key !== undefined) {
      if (body.anthropic_api_key) {
        await prisma.token.upsert({
          where: { serviceName: 'anthropic' },
          update: { 
            accessToken: body.anthropic_api_key,
            updatedAt: new Date()
          },
          create: {
            serviceName: 'anthropic',
            accessToken: body.anthropic_api_key
          }
        })
        updates.push('Anthropic API key')
      } else {
        await prisma.token.deleteMany({
          where: { serviceName: 'anthropic' }
        })
        updates.push('Anthropic API key (removed)')
      }
    }
    
    if (body.openai_api_key !== undefined) {
      if (body.openai_api_key) {
        await prisma.token.upsert({
          where: { serviceName: 'openai' },
          update: { 
            accessToken: body.openai_api_key,
            updatedAt: new Date()
          },
          create: {
            serviceName: 'openai',
            accessToken: body.openai_api_key
          }
        })
        updates.push('OpenAI API key')
      } else {
        await prisma.token.deleteMany({
          where: { serviceName: 'openai' }
        })
        updates.push('OpenAI API key (removed)')
      }
    }
    
    const message = updates.length > 0 
      ? `Settings updated: ${updates.join(', ')}`
      : 'Settings updated successfully'
    
    return successResponse({ message, updates })
  } catch (error) {
    console.error('Error updating settings:', error)
    return errorResponse('Failed to update settings', 500)
  }
}

export const PUT = POST