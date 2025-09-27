import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'
import { handleCors } from '@/lib/cors'
import fs from 'fs/promises'
import path from 'path'

interface RouteParams {
  params: {
    projectId: string
  }
}

interface RepoEntry {
  path: string
  type: 'file' | 'dir'
  size?: number
}

interface FileContent {
  path: string
  content: string
}

// Helper function to safely join paths (prevent directory traversal)
function safeJoin(repoRoot: string, relPath: string): string {
  const fullPath = path.normalize(path.join(repoRoot, relPath))
  const normalizedRepoRoot = path.normalize(repoRoot)
  
  if (!fullPath.startsWith(normalizedRepoRoot + path.sep) && fullPath !== normalizedRepoRoot) {
    throw new Error('Invalid path - directory traversal detected')
  }
  
  return fullPath
}

// Helper function to check if path is safe (no hidden files or dangerous directories)
function isSafePath(relativePath: string): boolean {
  const parts = relativePath.split(path.sep)
  
  // Block hidden files/directories, node_modules, .git, etc.
  const blockedPatterns = ['.git', 'node_modules', '.env', '.DS_Store']
  const hiddenPattern = /^\./
  
  return !parts.some(part => 
    hiddenPattern.test(part) || 
    blockedPatterns.includes(part)
  )
}

// OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCors(request) || new NextResponse(null, { status: 200 })
}

// GET /api/[projectId]/repo - Browse repository tree or get file content
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = params
    const { searchParams } = new URL(request.url)
    const dir = searchParams.get('dir') || '.'
    const filePath = searchParams.get('path')
    const action = searchParams.get('action')

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    })

    if (!project) {
      return errorResponse('Project not found', 404)
    }

    // Check if project is still initializing
    if (project.status === 'initializing') {
      return errorResponse('Project is still initializing', 400)
    }

    const repoRoot = path.join(project.path, 'repo')

    // Check if repo directory exists
    try {
      await fs.access(repoRoot)
    } catch (error) {
      if (project.status === 'failed') {
        return errorResponse('Project initialization failed', 400)
      } else {
        return errorResponse('Project repository not found', 400)
      }
    }

    // Handle file content request
    if (action === 'file' && filePath) {
      try {
        const targetPath = safeJoin(repoRoot, filePath)
        const stats = await fs.stat(targetPath)

        if (!stats.isFile()) {
          return errorResponse('Not a file', 400)
        }

        // Check if it's a safe path
        if (!isSafePath(filePath)) {
          return errorResponse('Access to this file is not allowed', 403)
        }

        const content = await fs.readFile(targetPath, 'utf8')
        
        const response: FileContent = {
          path: filePath,
          content
        }

        return successResponse(response)
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          return errorResponse('File not found', 404)
        } else if (error.message.includes('Invalid path')) {
          return errorResponse(error.message, 400)
        } else {
          console.error('Error reading file:', error)
          return errorResponse('Failed to read file', 500)
        }
      }
    }

    // Handle directory listing (tree)
    try {
      const targetPath = safeJoin(repoRoot, dir)
      const stats = await fs.stat(targetPath)

      if (!stats.isDirectory()) {
        return errorResponse('Not a directory', 400)
      }

      const entries = await fs.readdir(targetPath)
      const repoEntries: RepoEntry[] = []

      // Sort entries: directories first, then files, both alphabetically
      const sortedEntries = entries.sort((a, b) => {
        const aPath = path.join(targetPath, a)
        const bPath = path.join(targetPath, b)
        
        // We'll need to check if they're directories for sorting
        return a.localeCompare(b, undefined, { sensitivity: 'base' })
      })

      for (const entry of sortedEntries) {
        try {
          const entryPath = path.join(targetPath, entry)
          const relativePath = path.relative(repoRoot, entryPath)
          
          // Skip unsafe paths
          if (!isSafePath(relativePath)) {
            continue
          }

          const entryStats = await fs.stat(entryPath)
          
          if (entryStats.isDirectory()) {
            repoEntries.push({
              path: relativePath,
              type: 'dir'
            })
          } else {
            repoEntries.push({
              path: relativePath,
              type: 'file',
              size: entryStats.size
            })
          }
        } catch (error) {
          // Skip entries that can't be accessed
          continue
        }
      }

      // Sort the final entries: directories first, then files
      repoEntries.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'dir' ? -1 : 1
        }
        return a.path.localeCompare(b.path, undefined, { sensitivity: 'base' })
      })

      return successResponse(repoEntries)
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return errorResponse('Directory not found', 404)
      } else if (error.message.includes('Invalid path')) {
        return errorResponse(error.message, 400)
      } else {
        console.error('Error reading directory:', error)
        return errorResponse('Failed to read directory', 500)
      }
    }
  } catch (error) {
    console.error('Error in repo endpoint:', error)
    return errorResponse('Internal server error', 500)
  }
}

// POST /api/[projectId]/repo - Create or update files
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = params
    const body = await request.json()
    const { path: filePath, content, action = 'write' } = body

    if (!filePath) {
      return errorResponse('File path is required', 400)
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    })

    if (!project) {
      return errorResponse('Project not found', 404)
    }

    const repoRoot = path.join(project.path, 'repo')

    // Check if repo directory exists
    try {
      await fs.access(repoRoot)
    } catch (error) {
      return errorResponse('Project repository not found', 400)
    }

    // Check if it's a safe path
    if (!isSafePath(filePath)) {
      return errorResponse('Access to this path is not allowed', 403)
    }

    try {
      const targetPath = safeJoin(repoRoot, filePath)
      
      if (action === 'write' || action === 'create') {
        if (content === undefined) {
          return errorResponse('Content is required for write operations', 400)
        }

        // Ensure parent directory exists
        const parentDir = path.dirname(targetPath)
        await fs.mkdir(parentDir, { recursive: true })

        // Write the file
        await fs.writeFile(targetPath, content, 'utf8')

        return successResponse({
          path: filePath,
          message: `File ${action === 'create' ? 'created' : 'updated'} successfully`,
          size: Buffer.byteLength(content, 'utf8')
        })
      } else if (action === 'mkdir') {
        // Create directory
        await fs.mkdir(targetPath, { recursive: true })

        return successResponse({
          path: filePath,
          message: 'Directory created successfully',
          type: 'dir'
        })
      } else {
        return errorResponse('Invalid action. Use "write", "create", or "mkdir"', 400)
      }
    } catch (error: any) {
      if (error.message.includes('Invalid path')) {
        return errorResponse(error.message, 400)
      } else {
        console.error('Error creating/updating file:', error)
        return errorResponse('Failed to create/update file', 500)
      }
    }
  } catch (error) {
    console.error('Error in repo POST endpoint:', error)
    return errorResponse('Internal server error', 500)
  }
}

// DELETE /api/[projectId]/repo - Delete files or directories
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = params
    const { searchParams } = new URL(request.url)
    const filePath = searchParams.get('path')

    if (!filePath) {
      return errorResponse('File path is required', 400)
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    })

    if (!project) {
      return errorResponse('Project not found', 404)
    }

    const repoRoot = path.join(project.path, 'repo')

    // Check if repo directory exists
    try {
      await fs.access(repoRoot)
    } catch (error) {
      return errorResponse('Project repository not found', 400)
    }

    // Check if it's a safe path
    if (!isSafePath(filePath)) {
      return errorResponse('Access to this path is not allowed', 403)
    }

    try {
      const targetPath = safeJoin(repoRoot, filePath)
      const stats = await fs.stat(targetPath)

      if (stats.isDirectory()) {
        await fs.rm(targetPath, { recursive: true, force: true })
        return successResponse({
          path: filePath,
          message: 'Directory deleted successfully',
          type: 'dir'
        })
      } else {
        await fs.unlink(targetPath)
        return successResponse({
          path: filePath,
          message: 'File deleted successfully',
          type: 'file'
        })
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return errorResponse('File or directory not found', 404)
      } else if (error.message.includes('Invalid path')) {
        return errorResponse(error.message, 400)
      } else {
        console.error('Error deleting file/directory:', error)
        return errorResponse('Failed to delete file/directory', 500)
      }
    }
  } catch (error) {
    console.error('Error in repo DELETE endpoint:', error)
    return errorResponse('Internal server error', 500)
  }
}