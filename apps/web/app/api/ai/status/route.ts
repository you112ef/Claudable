import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const aiStatus = {
      overall: {
        configured: !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY),
        available: !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY)
      },
      providers: [
        {
          name: 'openai',
          configured: !!process.env.OPENAI_API_KEY,
          available: !!process.env.OPENAI_API_KEY,
          error: process.env.OPENAI_API_KEY ? null : 'API key not configured',
          details: {}
        },
        {
          name: 'anthropic',
          configured: !!process.env.ANTHROPIC_API_KEY,
          available: !!process.env.ANTHROPIC_API_KEY,
          error: process.env.ANTHROPIC_API_KEY ? null : 'API key not configured',
          details: {}
        }
      ]
    };

    return NextResponse.json(aiStatus);
  } catch (error) {
    console.error('Error fetching AI status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch AI status' },
      { status: 500 }
    );
  }
}