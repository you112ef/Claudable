import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const config = {
      api_url: process.env.NEXT_PUBLIC_API_BASE || 'https://your-app.vercel.app',
      web_url: process.env.NEXT_PUBLIC_WEB_URL || 'https://your-app.vercel.app',
      environment: process.env.NODE_ENV || 'production',
      features: {
        service_approvals: true,
        ai_integration: true,
        github_integration: !!process.env.GITHUB_TOKEN,
        vercel_integration: !!process.env.VERCEL_TOKEN,
        supabase_integration: !!process.env.SUPABASE_URL,
        analytics: true,
        error_reporting: true
      },
      services: {
        openai: !!process.env.OPENAI_API_KEY,
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        github: !!process.env.GITHUB_TOKEN,
        vercel: !!process.env.VERCEL_TOKEN,
        supabase: !!process.env.SUPABASE_URL
      }
    };

    return NextResponse.json(config);
  } catch (error) {
    console.error('Error fetching config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch config' },
      { status: 500 }
    );
  }
}