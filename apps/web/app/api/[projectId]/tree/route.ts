import { NextRequest, NextResponse } from 'next/server'
import { successResponse, errorResponse } from '@/lib/api-response'
import { handleCors } from '@/lib/cors'
import path from 'path'
import fs from 'fs/promises'

interface RouteParams {
  params: {
    projectId: string
  }
}

// OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCors(request) || new NextResponse(null, { status: 200 })
}

// GET /api/[projectId]/tree?dir= - Get project file tree
export async function GET(request: NextRequest, { params }: RouteParams) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse
  
  try {
    const { searchParams } = new URL(request.url)
    const dirParam = searchParams.get('dir') || ''
    
    // Get project path from database or construct it
    const projectPath = path.join(process.cwd(), '..', '..', 'data', 'projects', params.projectId)
    const targetPath = path.join(projectPath, dirParam)
    
    // Security check - ensure we're not going outside project directory
    if (!targetPath.startsWith(projectPath)) {
      return errorResponse('Invalid directory path', 400)
    }
    
    try {
      const stats = await fs.stat(targetPath)
      
      if (!stats.isDirectory()) {
        return errorResponse('Path is not a directory', 400)
      }
      
      const entries = await fs.readdir(targetPath, { withFileTypes: true })
      
      const tree = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(targetPath, entry.name)
          const relativePath = path.relative(projectPath, fullPath)
          
          if (entry.isDirectory()) {
            return {
              name: entry.name,
              path: relativePath,
              type: 'directory',
              children: [] // Could be expanded to show nested structure
            }
          } else {
            const stats = await fs.stat(fullPath)
            return {
              name: entry.name,
              path: relativePath,
              type: 'file',
              size: stats.size,
              modified: stats.mtime
            }
          }
        })
      )
      
      return successResponse({
        path: dirParam,
        entries: tree.sort((a, b) => {
          // Directories first, then files, both alphabetically
          if (a.type === 'directory' && b.type === 'file') return -1
          if (a.type === 'file' && b.type === 'directory') return 1
          return a.name.localeCompare(b.name)
        })
      })
    } catch (fsError) {
      // If directory doesn't exist, return empty tree
      return successResponse({
        path: dirParam,
        entries: []
      })
    }
  } catch (error) {
    console.error('Error fetching file tree:', error)
    return errorResponse('Failed to fetch file tree', 500)
  }
}