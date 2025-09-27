import { NextRequest, NextResponse } from 'next/server';

// Mock projects data for Vercel deployment
const mockProjects = [
  {
    id: 'project-1',
    name: 'Sample Project',
    description: 'A sample project for demonstration',
    status: 'active',
    created_at: '2025-09-27T00:00:00Z',
    updated_at: '2025-09-27T00:00:00Z'
  },
  {
    id: 'project-2',
    name: 'Demo Project',
    description: 'Another demo project',
    status: 'active',
    created_at: '2025-09-27T00:00:00Z',
    updated_at: '2025-09-27T00:00:00Z'
  }
];

export async function GET(request: NextRequest) {
  try {
    // In production, this would connect to your actual database
    // For Vercel demo, we'll return mock data
    return NextResponse.json(mockProjects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 }
      );
    }

    // In production, this would save to your actual database
    // For Vercel demo, we'll return a success response
    const newProject = {
      id: `project-${Date.now()}`,
      name,
      description: description || '',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    return NextResponse.json({
      success: true,
      message: 'Project created successfully',
      project: newProject
    });
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}