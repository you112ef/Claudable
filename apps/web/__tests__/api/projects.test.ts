import { GET, POST } from '@/app/api/projects/route'
import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    project: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    session: {
      create: jest.fn()
    },
    message: {
      create: jest.fn()
    }
  }
}))

// Mock fs
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined)
}))

describe('/api/projects', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET', () => {
    it('should return all projects', async () => {
      const mockProjects = [
        {
          id: 'test-project-1',
          name: 'Test Project 1',
          description: 'Description 1',
          createdAt: new Date(),
          updatedAt: new Date(),
          messages: [],
          projectServices: []
        }
      ];

      (prisma.project.findMany as jest.Mock).mockResolvedValue(mockProjects)

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveLength(1)
      expect(data[0].id).toBe('test-project-1')
      expect(data[0].name).toBe('Test Project 1')
    })

    it('should handle errors gracefully', async () => {
      (prisma.project.findMany as jest.Mock).mockRejectedValue(new Error('Database error'))

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to fetch projects')
    })
  })

  describe('POST', () => {
    it('should create a new project', async () => {
      const mockProject = {
        id: 'new-project',
        name: 'New Project',
        projectPath: '/path/to/project',
        description: 'Initial prompt',
        template: 'custom',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      (prisma.project.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.project.create as jest.Mock).mockResolvedValue(mockProject)

      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          project_id: 'new-project',
          name: 'New Project',
          initial_prompt: 'Initial prompt'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.id).toBe('new-project')
      expect(data.name).toBe('New Project')
      expect(prisma.project.create).toHaveBeenCalled()
    })

    it('should reject invalid project ID format', async () => {
      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          project_id: 'Invalid ID!',
          name: 'New Project'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid project ID format')
    })

    it('should reject duplicate project ID', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({ id: 'existing-project' })

      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          project_id: 'existing-project',
          name: 'New Project'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toBe('Project with this ID already exists')
    })
  })
})