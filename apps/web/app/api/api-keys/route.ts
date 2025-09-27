import { NextRequest, NextResponse } from 'next/server';

// Mock API Keys data for Vercel deployment
const mockAPIKeys = [
  {
    id: 'mock-1',
    provider: 'openai',
    name: 'OpenAI Production Key',
    is_active: true,
    created_at: '2025-09-27T00:00:00Z',
    last_used: null,
    usage_count: '0'
  },
  {
    id: 'mock-2',
    provider: 'anthropic',
    name: 'Anthropic Production Key',
    is_active: true,
    created_at: '2025-09-27T00:00:00Z',
    last_used: null,
    usage_count: '0'
  }
];

export async function GET(request: NextRequest) {
  try {
    // In production, this would connect to your actual database
    // For Vercel demo, we'll return mock data
    return NextResponse.json(mockAPIKeys);
  } catch (error) {
    console.error('Error fetching API keys:', error);
    return NextResponse.json(
      { error: 'Failed to fetch API keys' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { service_type, key_name, api_key, is_active = true } = body;

    if (!service_type || !key_name || !api_key) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // In production, this would save to your actual database
    // For Vercel demo, we'll return a success response
    const newKey = {
      id: `mock-${Date.now()}`,
      provider: service_type,
      name: key_name,
      is_active,
      created_at: new Date().toISOString(),
      last_used: null,
      usage_count: '0'
    };

    return NextResponse.json({
      success: true,
      message: 'API key saved successfully',
      token_id: newKey.id
    });
  } catch (error) {
    console.error('Error saving API key:', error);
    return NextResponse.json(
      { error: 'Failed to save API key' },
      { status: 500 }
    );
  }
}