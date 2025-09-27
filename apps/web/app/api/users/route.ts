import { NextRequest, NextResponse } from 'next/server';

// Mock users data for Vercel deployment
const mockUsers = [
  {
    id: 'user-1',
    name: 'John Doe',
    email: 'john@example.com',
    role: 'admin',
    created_at: '2025-09-27T00:00:00Z',
    last_login: '2025-09-27T00:00:00Z'
  },
  {
    id: 'user-2',
    name: 'Jane Smith',
    email: 'jane@example.com',
    role: 'user',
    created_at: '2025-09-27T00:00:00Z',
    last_login: '2025-09-27T00:00:00Z'
  }
];

export async function GET(request: NextRequest) {
  try {
    // In production, this would connect to your actual database
    // For Vercel demo, we'll return mock data
    return NextResponse.json(mockUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, role = 'user' } = body;

    if (!name || !email) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      );
    }

    // In production, this would save to your actual database
    // For Vercel demo, we'll return a success response
    const newUser = {
      id: `user-${Date.now()}`,
      name,
      email,
      role,
      created_at: new Date().toISOString(),
      last_login: null
    };

    return NextResponse.json({
      success: true,
      message: 'User created successfully',
      user: newUser
    });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}