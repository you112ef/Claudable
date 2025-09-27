import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'
import { handleCors } from '@/lib/cors'
import fs from 'fs/promises'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

interface RouteParams {
  params: {
    projectId: string
  }
}

// OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCors(request) || new NextResponse(null, { status: 200 })
}

// POST /api/[projectId]/assets - Upload asset files (logo or images)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = params
    
    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    })

    if (!project) {
      return errorResponse('Project not found', 404)
    }

    const contentType = request.headers.get('content-type')
    
    if (contentType?.includes('application/json')) {
      // Handle base64 logo upload
      const body = await request.json()
      const { b64_png } = body

      if (!b64_png) {
        return errorResponse('Base64 PNG data is required', 400)
      }

      try {
        // Decode base64 data
        const buffer = Buffer.from(b64_png, 'base64')
        
        // Create assets directory
        const projectPath = path.join(process.cwd(), '..', '..', 'data', 'projects', projectId)
        const assetsDir = path.join(projectPath, 'assets')
        await fs.mkdir(assetsDir, { recursive: true })
        
        // Save logo.png
        const logoPath = path.join(assetsDir, 'logo.png')
        await fs.writeFile(logoPath, buffer)

        return successResponse({
          path: 'assets/logo.png',
          absolute_path: logoPath,
          filename: 'logo.png',
          message: 'Logo uploaded successfully'
        })
      } catch (error) {
        console.error('Error processing base64 logo:', error)
        return errorResponse('Failed to process logo data', 500)
      }
    } else if (contentType?.includes('multipart/form-data')) {
      // Handle file upload
      try {
        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
          return errorResponse('No file provided', 400)
        }

        // Check if file is an image
        if (!file.type.startsWith('image/')) {
          return errorResponse('File must be an image', 400)
        }

        // Create assets directory
        const projectPath = path.join(process.cwd(), '..', '..', 'data', 'projects', projectId)
        const assetsDir = path.join(projectPath, 'assets')
        await fs.mkdir(assetsDir, { recursive: true })

        // Generate unique filename
        const fileExtension = path.extname(file.name || '.png')
        const uniqueFilename = `${uuidv4()}${fileExtension}`
        const filePath = path.join(assetsDir, uniqueFilename)

        // Save file
        const buffer = Buffer.from(await file.arrayBuffer())
        await fs.writeFile(filePath, buffer)

        return successResponse({
          path: `assets/${uniqueFilename}`,
          absolute_path: filePath,
          filename: uniqueFilename,
          original_filename: file.name,
          size: buffer.length,
          message: 'File uploaded successfully'
        })
      } catch (error) {
        console.error('Error uploading file:', error)
        return errorResponse('Failed to upload file', 500)
      }
    } else {
      return errorResponse('Invalid content type. Expected JSON or multipart/form-data', 400)
    }
  } catch (error) {
    console.error('Error in assets endpoint:', error)
    return errorResponse('Internal server error', 500)
  }
}

// GET /api/[projectId]/assets - List assets in project
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = params
    
    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    })

    if (!project) {
      return errorResponse('Project not found', 404)
    }

    // Check assets directory
    const projectPath = path.join(process.cwd(), '..', '..', 'data', 'projects', projectId)
    const assetsDir = path.join(projectPath, 'assets')

    try {
      const files = await fs.readdir(assetsDir)
      const assets = await Promise.all(
        files.map(async (filename) => {
          const filePath = path.join(assetsDir, filename)
          const stats = await fs.stat(filePath)
          return {
            filename,
            path: `assets/${filename}`,
            absolute_path: filePath,
            size: stats.size,
            created_at: stats.ctime,
            modified_at: stats.mtime
          }
        })
      )

      return successResponse({ assets })
    } catch (error) {
      // Assets directory doesn't exist or is empty
      return successResponse({ assets: [] })
    }
  } catch (error) {
    console.error('Error listing assets:', error)
    return errorResponse('Failed to list assets', 500)
  }
}

// DELETE /api/[projectId]/assets?filename=... - Delete specific asset
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = params
    const { searchParams } = new URL(request.url)
    const filename = searchParams.get('filename')

    if (!filename) {
      return errorResponse('Filename parameter is required', 400)
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    })

    if (!project) {
      return errorResponse('Project not found', 404)
    }

    // Sanitize filename to prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return errorResponse('Invalid filename', 400)
    }

    const projectPath = path.join(process.cwd(), '..', '..', 'data', 'projects', projectId)
    const filePath = path.join(projectPath, 'assets', filename)

    try {
      await fs.unlink(filePath)
      return successResponse({ 
        message: `Asset ${filename} deleted successfully`,
        filename 
      })
    } catch (error) {
      return errorResponse('Asset not found or could not be deleted', 404)
    }
  } catch (error) {
    console.error('Error deleting asset:', error)
    return errorResponse('Failed to delete asset', 500)
  }
}