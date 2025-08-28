import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'
import { handleCors } from '@/lib/cors'
import { v4 as uuidv4 } from 'uuid'

interface VercelConnectRequest {
  project_name: string
  framework?: string
  team_id?: string
}

interface VercelConnectResponse {
  success: boolean
  project_url: string
  deployment_url?: string
  message: string
}

interface VercelDeploymentRequest {
  branch?: string
}

interface VercelDeploymentResponse {
  success: boolean
  deployment_url: string
  deployment_id: string
  status: string
  message: string
}

// Helper function to get Vercel token
async function getVercelToken(): Promise<string | null> {
  const token = await prisma.token.findUnique({
    where: { serviceName: 'vercel' }
  })
  return token?.accessToken || null
}

// Helper function to check project availability
async function checkVercelProjectAvailability(token: string, projectName: string) {
  try {
    const response = await fetch(`https://api.vercel.com/v9/projects/${projectName}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (response.status === 404) {
      return { exists: false }
    } else if (response.ok) {
      return { exists: true }
    } else if (response.status === 401) {
      return { error: 'Invalid Vercel token' }
    } else {
      return { error: 'Failed to check project' }
    }
  } catch (error) {
    console.error('Error checking Vercel project availability:', error)
    return { error: 'Network error' }
  }
}

// Helper function to validate Vercel token
async function validateVercelToken(token: string) {
  try {
    const response = await fetch('https://api.vercel.com/v2/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (response.ok) {
      const userData = await response.json()
      return { 
        valid: true, 
        user_id: userData.user?.id,
        username: userData.user?.username || userData.user?.name
      }
    } else {
      return { valid: false }
    }
  } catch (error) {
    console.error('Error validating Vercel token:', error)
    return { valid: false }
  }
}

// Helper function to create Vercel project with GitHub integration
async function createVercelProjectWithGitHub(token: string, projectName: string, githubRepo: string, framework = 'nextjs', teamId?: string) {
  try {
    const body: any = {
      name: projectName,
      gitRepository: {
        type: 'github',
        repo: githubRepo
      },
      framework: framework
    }

    if (teamId) {
      body.teamId = teamId
    }

    const response = await fetch('https://api.vercel.com/v10/projects', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || 'Failed to create Vercel project')
    }

    const projectData = await response.json()
    return {
      success: true,
      project_id: projectData.id,
      project_name: projectData.name,
      project_url: `https://vercel.com/${projectData.accountId}/${projectData.name}`
    }
  } catch (error) {
    console.error('Error creating Vercel project:', error)
    return { success: false, error: (error as Error).message }
  }
}

// Helper function to create deployment
async function createVercelDeployment(token: string, projectName: string, githubRepoId: string, branch = 'main', framework = 'nextjs') {
  try {
    const response = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: projectName,
        source: 'github',
        gitSource: {
          type: 'github',
          repoId: githubRepoId,
          ref: branch
        },
        projectSettings: {
          framework: framework
        }
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || 'Failed to create deployment')
    }

    const deploymentData = await response.json()
    return {
      success: true,
      deployment_id: deploymentData.id,
      deployment_url: deploymentData.url,
      status: deploymentData.readyState || 'BUILDING'
    }
  } catch (error) {
    console.error('Error creating Vercel deployment:', error)
    return { success: false, error: (error as Error).message }
  }
}

// OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCors(request) || new NextResponse(null, { status: 200 })
}

// GET /api/vercel - Handle various Vercel operations
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const projectId = searchParams.get('project_id')
    const projectName = searchParams.get('project_name')

    // Get Vercel token
    const vercelToken = await getVercelToken()
    if (!vercelToken) {
      return errorResponse('Vercel token not configured', 401)
    }

    // Handle project availability check
    if (action === 'check-project' && projectName) {
      // First validate the token
      const tokenValidation = await validateVercelToken(vercelToken)
      if (!tokenValidation.valid) {
        return errorResponse('Invalid Vercel token', 401)
      }

      const result = await checkVercelProjectAvailability(vercelToken, projectName)
      
      if (result.error) {
        if (result.error.includes('Invalid') || result.error.includes('token')) {
          return errorResponse('Invalid Vercel token', 401)
        } else {
          return errorResponse(result.error, 500)
        }
      }
      
      if (result.exists) {
        return errorResponse(`Project '${projectName}' already exists`, 409)
      }
      
      return successResponse({ available: true })
    }

    // Handle connection status check
    if (action === 'status' && projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          projectServices: {
            where: { serviceName: 'vercel' }
          }
        }
      })

      if (!project) {
        return errorResponse('Project not found', 404)
      }

      // Check if Vercel token exists
      const tokenExists = !!vercelToken

      const connection = project.projectServices[0]
      
      // Check if project is actually connected (has service_data with project info)
      const projectConnected = !!(
        connection && 
        connection.isActive && 
        connection.connectionData &&
        JSON.parse(connection.connectionData).project_id
      )

      if (!connection) {
        return successResponse({
          connected: false,
          status: 'disconnected',
          token_exists: tokenExists,
          project_connected: false
        })
      }

      const serviceData = JSON.parse(connection.connectionData || '{}')
      return successResponse({
        connected: projectConnected && tokenExists,
        status: connection.isActive ? 'connected' : 'disconnected',
        service_data: serviceData,
        created_at: connection.createdAt.toISOString(),
        updated_at: connection.updatedAt.toISOString(),
        token_exists: tokenExists,
        project_connected: projectConnected
      })
    }

    // Handle current deployment status check
    if (action === 'deployment-current' && projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          projectServices: {
            where: { serviceName: 'vercel' }
          }
        }
      })

      if (!project) {
        return errorResponse('Project not found', 404)
      }

      const connection = project.projectServices[0]
      if (!connection) {
        return successResponse({ has_deployment: false, message: 'Vercel not connected' })
      }

      const serviceData = JSON.parse(connection.connectionData || '{}')
      const currentDeployment = serviceData.current_deployment

      if (!currentDeployment) {
        return successResponse({
          has_deployment: false,
          last_deployment_url: serviceData.deployment_url,
          last_deployment_at: serviceData.last_deployment_at
        })
      }

      return successResponse({
        has_deployment: true,
        deployment_id: currentDeployment.deployment_id,
        status: currentDeployment.status,
        deployment_url: currentDeployment.deployment_url,
        last_checked_at: currentDeployment.last_checked_at
      })
    }

    return errorResponse('Invalid action or missing parameters', 400)
  } catch (error) {
    console.error('Error in Vercel GET endpoint:', error)
    return errorResponse('Internal server error', 500)
  }
}

// POST /api/vercel - Handle Vercel project creation and deployments
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, project_id, project_name, framework = 'nextjs', team_id, branch = 'main' } = body

    if (!project_id) {
      return errorResponse('Project ID is required', 400)
    }

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: project_id },
      include: {
        projectServices: {
          where: { serviceName: 'github' }
        }
      }
    })

    if (!project) {
      return errorResponse('Project not found', 404)
    }

    // Get Vercel token
    const vercelToken = await getVercelToken()
    if (!vercelToken) {
      return errorResponse('Vercel token not configured. Please add your Vercel token in Global Settings.', 401)
    }

    // Handle project connection
    if (action === 'connect' && project_name) {
      // Check if GitHub is connected (required for Vercel)
      const githubConnection = project.projectServices[0]
      
      if (!githubConnection) {
        return errorResponse('GitHub repository must be connected first before connecting Vercel', 400)
      }

      const githubServiceData = JSON.parse(githubConnection.connectionData || '{}')
      const githubRepo = githubServiceData.full_name
      const githubRepoId = githubServiceData.repo_id

      if (!githubRepo) {
        return errorResponse('GitHub repository full_name is missing. Please reconnect GitHub repository.', 400)
      }

      if (!githubRepoId) {
        return errorResponse('GitHub repository repo_id is missing. Please reconnect GitHub repository.', 400)
      }

      try {
        // Validate token and get user info
        const userInfo = await validateVercelToken(vercelToken)
        if (!userInfo.valid) {
          return errorResponse('Invalid Vercel token', 401)
        }

        // Create Vercel project
        const projectResult = await createVercelProjectWithGitHub(vercelToken, project_name, githubRepo, framework, team_id)
        
        if (!projectResult.success) {
          return errorResponse('Failed to create Vercel project', 500)
        }

        // Save service connection to database
        try {
          const serviceData = {
            project_id: projectResult.project_id,
            project_name: projectResult.project_name,
            project_url: projectResult.project_url,
            framework: framework,
            github_repo: githubRepo,
            team_id: team_id,
            user_id: userInfo.user_id,
            username: userInfo.username
          }

          await prisma.projectService.upsert({
            where: {
              projectId_serviceName: {
                projectId: project_id,
                serviceName: 'vercel'
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
              serviceName: 'vercel',
              connectionData: JSON.stringify(serviceData),
              isActive: true
            }
          })
        } catch (dbError) {
          console.error('Database update failed:', dbError)
          // Don't fail the operation for database issues
        }

        const response: VercelConnectResponse = {
          success: true,
          project_url: projectResult.project_url,
          message: `Vercel project '${project_name}' created and connected successfully!`
        }

        return successResponse(response)
      } catch (error) {
        console.error('Error in Vercel connect:', error)
        return errorResponse('Failed to connect Vercel project', 500)
      }
    }

    // Handle deployment creation
    if (action === 'deploy') {
      try {
        const vercelConnection = await prisma.projectService.findUnique({
          where: {
            projectId_serviceName: {
              projectId: project_id,
              serviceName: 'vercel'
            }
          }
        })

        if (!vercelConnection) {
          return errorResponse('Vercel project not connected', 400)
        }

        const githubConnection = project.projectServices[0]
        if (!githubConnection) {
          return errorResponse('GitHub repository not connected', 400)
        }

        const vercelServiceData = JSON.parse(vercelConnection.connectionData || '{}')
        const githubServiceData = JSON.parse(githubConnection.connectionData || '{}')
        const githubRepoId = githubServiceData.repo_id

        if (!githubRepoId) {
          return errorResponse(
            'GitHub repository information is incomplete. Please reconnect GitHub repository.',
            400
          )
        }

        // Create deployment
        const deploymentResult = await createVercelDeployment(
          vercelToken,
          vercelServiceData.project_name,
          githubRepoId,
          branch,
          vercelServiceData.framework || 'nextjs'
        )

        if (!deploymentResult.success) {
          return errorResponse('Failed to create deployment', 500)
        }

        // Update service data with deployment info
        try {
          vercelServiceData.last_deployment_id = deploymentResult.deployment_id
          vercelServiceData.last_deployment_url = `https://${deploymentResult.deployment_url}`
          
          if (!vercelServiceData.deployment_url) {
            vercelServiceData.deployment_url = vercelServiceData.last_deployment_url
          }

          vercelServiceData.current_deployment = {
            deployment_id: deploymentResult.deployment_id,
            status: deploymentResult.status,
            deployment_url: deploymentResult.deployment_url,
            started_at: new Date().toISOString()
          }

          await prisma.projectService.update({
            where: { id: vercelConnection.id },
            data: {
              connectionData: JSON.stringify(vercelServiceData),
              updatedAt: new Date()
            }
          })
        } catch (error) {
          console.error('Failed to update deployment info:', error)
        }

        const response: VercelDeploymentResponse = {
          success: true,
          deployment_url: `https://${deploymentResult.deployment_url}`,
          deployment_id: deploymentResult.deployment_id,
          status: deploymentResult.status,
          message: 'Deployment created successfully!'
        }

        return successResponse(response)
      } catch (error) {
        console.error('Error in Vercel deployment:', error)
        return errorResponse('Failed to deploy to Vercel', 500)
      }
    }

    return errorResponse('Invalid action', 400)
  } catch (error) {
    console.error('Error in Vercel POST endpoint:', error)
    return errorResponse('Internal server error', 500)
  }
}

// DELETE /api/vercel - Handle Vercel disconnection
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

    // Find and delete Vercel connection
    const deletedConnection = await prisma.projectService.deleteMany({
      where: {
        projectId: projectId,
        serviceName: 'vercel'
      }
    })

    if (deletedConnection.count === 0) {
      return errorResponse('Vercel connection not found', 404)
    }

    return successResponse({ message: 'Vercel project disconnected successfully' })
  } catch (error) {
    console.error('Error disconnecting Vercel:', error)
    return errorResponse('Failed to disconnect Vercel project', 500)
  }
}