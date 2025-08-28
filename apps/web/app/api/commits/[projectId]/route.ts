import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'
import { handleCors } from '@/lib/cors'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

interface RouteParams {
  params: {
    projectId: string
  }
}

// OPTIONS handler for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCors(request) || new NextResponse(null, { status: 200 })
}

// GET /api/commits/[projectId] - Get commits for project
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const commits = await prisma.commit.findMany({
      where: { projectId: params.projectId },
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset
    })

    const formattedCommits = commits.map(commit => ({
      id: commit.id,
      project_id: commit.projectId,
      commit_hash: commit.commitHash,
      message: commit.message,
      author: commit.author,
      branch: commit.branch,
      timestamp: commit.timestamp,
      files_changed: commit.filesChanged,
      insertions: commit.insertions,
      deletions: commit.deletions,
      created_at: commit.createdAt
    }))

    return successResponse(formattedCommits)
  } catch (error) {
    console.error('Error fetching commits:', error)
    return errorResponse('Failed to fetch commits', 500)
  }
}

// POST /api/commits/[projectId] - Create a new commit
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json()
    const { message, files = [] } = body

    if (!message) {
      return errorResponse('Commit message is required', 400)
    }

    // Get project to find the path
    const project = await prisma.project.findUnique({
      where: { id: params.projectId }
    })

    if (!project) {
      return errorResponse('Project not found', 404)
    }

    const projectPath = project.path

    // Stage files if provided
    if (files.length > 0) {
      for (const file of files) {
        await execAsync(`git add "${file}"`, { cwd: projectPath })
      }
    } else {
      // Stage all changes
      await execAsync('git add .', { cwd: projectPath })
    }

    // Create commit
    const { stdout: commitOutput } = await execAsync(
      `git commit -m "${message.replace(/"/g, '\\"')}"`,
      { cwd: projectPath }
    )

    // Get commit details
    const { stdout: logOutput } = await execAsync(
      'git log -1 --format="%H|%an|%s|%b|%ai"',
      { cwd: projectPath }
    )

    const [hash, author, subject, , timestamp] = logOutput.trim().split('|')

    // Get branch
    const { stdout: branchOutput } = await execAsync(
      'git branch --show-current',
      { cwd: projectPath }
    )

    // Get stats
    const { stdout: statsOutput } = await execAsync(
      `git diff-tree --no-commit-id --numstat -r ${hash}`,
      { cwd: projectPath }
    )

    const stats = statsOutput.trim().split('\n').filter(Boolean)
    let insertions = 0
    let deletions = 0
    const filesChanged = stats.length

    stats.forEach(line => {
      const [added, deleted] = line.split('\t')
      insertions += parseInt(added) || 0
      deletions += parseInt(deleted) || 0
    })

    // Save to database
    const commit = await prisma.commit.create({
      data: {
        projectId: params.projectId,
        commitHash: hash.trim(),
        message: subject.trim(),
        author: author.trim(),
        branch: branchOutput.trim(),
        timestamp: new Date(timestamp.trim()),
        filesChanged,
        insertions,
        deletions
      }
    })

    return successResponse({
      id: commit.id,
      project_id: commit.projectId,
      commit_hash: commit.commitHash,
      message: commit.message,
      author: commit.author,
      branch: commit.branch,
      timestamp: commit.timestamp,
      files_changed: commit.filesChanged,
      insertions: commit.insertions,
      deletions: commit.deletions,
      created_at: commit.createdAt
    }, 201)
  } catch (error: any) {
    console.error('Error creating commit:', error)
    if (error.message?.includes('nothing to commit')) {
      return errorResponse('Nothing to commit', 400)
    }
    return errorResponse('Failed to create commit', 500)
  }
}