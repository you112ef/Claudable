import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'
import { handleCors } from '@/lib/cors'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

const execAsync = promisify(exec)

interface GitHubConnectRequest {
  repo_name: string
  description?: string
  private?: boolean
}

interface GitHubConnectResponse {
  success: boolean
  repo_url: string
  message: string
}

interface GitPushResponse {
  success: boolean
  message: string
  branch?: string
}

// Helper function to get GitHub token
async function getGitHubToken(): Promise<string | null> {
  const token = await prisma.token.findUnique({
    where: { serviceName: 'github' }
  })
  return token?.accessToken || null
}

// Helper function to check repo availability
async function checkRepoAvailability(token: string, repoName: string) {
  try {
    const response = await fetch(`https://api.github.com/repos/username/${repoName}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Claudable-App'
      }
    })
    
    if (response.status === 404) {
      // Get authenticated user info
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Claudable-App'
        }
      })
      
      if (!userResponse.ok) {
        return { error: 'Invalid GitHub token' }
      }
      
      const userInfo = await userResponse.json()
      return { exists: false, username: userInfo.login }
    } else if (response.ok) {
      return { exists: true }
    } else {
      return { error: 'Failed to check repository' }
    }
  } catch (error) {
    console.error('Error checking repo availability:', error)
    return { error: 'Network error' }
  }
}

// Helper function to create GitHub repository
async function createGitHubRepo(token: string, repoName: string, description: string, isPrivate: boolean) {
  try {
    const response = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Claudable-App'
      },
      body: JSON.stringify({
        name: repoName,
        description: description || `Created with Claudable`,
        private: isPrivate,
        auto_init: false,
        has_issues: true,
        has_projects: true,
        has_wiki: false
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to create repository')
    }

    const repoData = await response.json()
    return {
      success: true,
      repo_url: repoData.html_url,
      clone_url: repoData.clone_url,
      ssh_url: repoData.ssh_url,
      full_name: repoData.full_name,
      repo_id: repoData.id,
      default_branch: repoData.default_branch || 'main'
    }
  } catch (error) {
    console.error('Error creating GitHub repository:', error)
    return { success: false, error: (error as Error).message }
  }
}

// OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCors(request) || new NextResponse(null, { status: 200 })
}

// GET /api/github - Handle various GitHub operations
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const projectId = searchParams.get('project_id')
    const repoName = searchParams.get('repo_name')

    // Get GitHub token
    const githubToken = await getGitHubToken()
    if (!githubToken) {
      return errorResponse('GitHub token not configured', 401)
    }

    // Handle repository availability check
    if (action === 'check-repo' && repoName) {
      const result = await checkRepoAvailability(githubToken, repoName)
      
      if (result.error) {
        if (result.error.includes('Invalid')) {
          return errorResponse(result.error, 401)
        } else {
          return errorResponse(result.error, 500)
        }
      }
      
      if (result.exists) {
        return errorResponse(`Repository '${repoName}' already exists`, 409)
      }
      
      return successResponse({ available: true, username: result.username })
    }

    // Handle connection status check
    if (action === 'status' && projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          projectServices: {
            where: { serviceName: 'github' }
          }
        }
      })

      if (!project) {
        return errorResponse('Project not found', 404)
      }

      const connection = project.projectServices[0]
      
      if (!connection) {
        return successResponse({ connected: false, status: 'disconnected' })
      }

      const serviceData = JSON.parse(connection.connectionData || '{}')
      return successResponse({
        connected: true,
        status: connection.isActive ? 'connected' : 'disconnected',
        service_data: serviceData,
        created_at: connection.createdAt.toISOString(),
        updated_at: connection.updatedAt.toISOString()
      })
    }

    return errorResponse('Invalid action or missing parameters', 400)
  } catch (error) {
    console.error('Error in GitHub GET endpoint:', error)
    return errorResponse('Internal server error', 500)
  }
}

// POST /api/github - Handle GitHub repository creation and connection
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, project_id, repo_name, description = '', private: isPrivate = false } = body

    if (!project_id) {
      return errorResponse('Project ID is required', 400)
    }

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: project_id }
    })

    if (!project) {
      return errorResponse('Project not found', 404)
    }

    // Get GitHub token
    const githubToken = await getGitHubToken()
    if (!githubToken) {
      return errorResponse('GitHub token not configured. Please add your GitHub token in Global Settings.', 401)
    }

    // Handle repository connection
    if (action === 'connect' && repo_name) {
      try {
        // Get user info first
        const userResponse = await fetch('https://api.github.com/user', {
          headers: {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Claudable-App'
          }
        })

        if (!userResponse.ok) {
          return errorResponse('Invalid GitHub token', 401)
        }

        const userInfo = await userResponse.json()
        const username = userInfo.login
        const userEmail = userInfo.email || `${username}@users.noreply.github.com`

        // Create GitHub repository
        const repoResult = await createGitHubRepo(githubToken, repo_name, description, isPrivate)
        
        if (!repoResult.success) {
          return errorResponse('Failed to create GitHub repository', 500)
        }

        // Setup local Git repository
        const repoPath = path.join(project.path, 'repo')
        
        try {
          // Set Git config
          await execAsync(`git config user.name "${userInfo.name || username}"`, { cwd: repoPath })
          await execAsync(`git config user.email "${userEmail}"`, { cwd: repoPath })
          
          // Initialize if needed
          try {
            await execAsync('git status', { cwd: repoPath })
          } catch {
            await execAsync('git init', { cwd: repoPath })
            await execAsync('git checkout -b main', { cwd: repoPath }).catch(() => {})
          }

          // Create authenticated URL
          const authenticatedUrl = repoResult.clone_url.replace(
            'https://github.com/',
            `https://${username}:${githubToken}@github.com/`
          )

          // Add remote origin
          await execAsync('git remote remove origin', { cwd: repoPath }).catch(() => {})
          await execAsync(`git remote add origin "${authenticatedUrl}"`, { cwd: repoPath })

          // Create initial commit if needed
          try {
            const { stdout: status } = await execAsync('git status --porcelain', { cwd: repoPath })
            if (status.trim()) {
              await execAsync('git add .', { cwd: repoPath })
              await execAsync('git commit -m "Initial commit - connected to GitHub"', { cwd: repoPath })
            }
          } catch (error) {
            console.log('No changes to commit or commit failed:', error)
          }
          
        } catch (gitError) {
          console.error('Git operations failed:', gitError)
          return errorResponse(
            `GitHub repository created at ${repoResult.repo_url}, but local Git setup failed: ${gitError}. You may need to connect manually.`,
            500
          )
        }

        // Save service connection to database
        try {
          const serviceData = {
            repo_url: repoResult.repo_url,
            repo_name: repo_name,
            clone_url: repoResult.clone_url,
            ssh_url: repoResult.ssh_url,
            default_branch: repoResult.default_branch,
            private: isPrivate,
            username: username,
            full_name: repoResult.full_name,
            repo_id: repoResult.repo_id
          }

          await prisma.projectService.upsert({
            where: {
              projectId_serviceName: {
                projectId: project_id,
                serviceName: 'github'
              }
            },
            update: {
              connectionData: JSON.stringify(serviceData),
              isActive: true,
              updatedAt: new Date()
            },
            create: {
              id: uuidv4(),
              projectId: project_id,
              serviceName: 'github',
              connectionData: JSON.stringify(serviceData),
              isActive: true
            }
          })
        } catch (dbError) {
          console.error('Database update failed:', dbError)
          // Don't fail the operation for database issues
        }

        const response: GitHubConnectResponse = {
          success: true,
          repo_url: repoResult.repo_url,
          message: `GitHub repository '${repo_name}' created and connected successfully!`
        }

        return successResponse(response)
      } catch (error) {
        console.error('Error in GitHub connect:', error)
        return errorResponse('Failed to connect GitHub repository', 500)
      }
    }

    // Handle repository push
    if (action === 'push') {
      try {
        const connection = await prisma.projectService.findUnique({
          where: {
            projectId_serviceName: {
              projectId: project_id,
              serviceName: 'github'
            }
          }
        })

        if (!connection) {
          return errorResponse('GitHub repository not connected', 400)
        }

        const serviceData = JSON.parse(connection.connectionData || '{}')
        const repoPath = path.join(project.path, 'repo')
        const defaultBranch = serviceData.default_branch || 'main'

        // Commit any pending changes
        try {
          await execAsync('git add .', { cwd: repoPath })
          await execAsync('git commit -m "Publish from Lovable UI"', { cwd: repoPath })
        } catch (error) {
          console.log('No changes to commit or commit failed:', error)
        }

        // Push to remote
        const { stdout, stderr } = await execAsync(
          `git push origin ${defaultBranch}`,
          { cwd: repoPath }
        )

        // Update last push timestamp
        serviceData.last_push_at = new Date().toISOString()
        serviceData.last_pushed_branch = defaultBranch

        await prisma.projectService.update({
          where: { id: connection.id },
          data: {
            connectionData: JSON.stringify(serviceData),
            updatedAt: new Date()
          }
        })

        const response: GitPushResponse = {
          success: true,
          message: 'Pushed to GitHub',
          branch: defaultBranch
        }

        return successResponse(response)
      } catch (error) {
        console.error('Error pushing to GitHub:', error)
        return errorResponse('Failed to push to GitHub', 500)
      }
    }

    return errorResponse('Invalid action', 400)
  } catch (error) {
    console.error('Error in GitHub POST endpoint:', error)
    return errorResponse('Internal server error', 500)
  }
}

// DELETE /api/github - Handle GitHub disconnection
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')

    if (!projectId) {
      return errorResponse('Project ID is required', 400)
    }

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    })

    if (!project) {
      return errorResponse('Project not found', 404)
    }

    // Find and delete GitHub connection
    const deletedConnection = await prisma.projectService.deleteMany({
      where: {
        projectId: projectId,
        serviceName: 'github'
      }
    })

    if (deletedConnection.count === 0) {
      return errorResponse('GitHub connection not found', 404)
    }

    return successResponse({ message: 'GitHub repository disconnected successfully' })
  } catch (error) {
    console.error('Error disconnecting GitHub:', error)
    return errorResponse('Failed to disconnect GitHub repository', 500)
  }
}