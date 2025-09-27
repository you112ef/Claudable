# Claudable Deployment Guide

## Vercel Deployment

### Prerequisites
- Vercel account
- GitHub repository with Claudable code
- API keys for AI services (Claude, Cursor, OpenAI, etc.)

### Environment Variables

Configure the following environment variables in your Vercel project settings:

#### Required Environment Variables

```bash
# Database
DATABASE_URL=postgresql://username:password@host:port/database

# API Configuration
API_PORT=8080
PROJECTS_ROOT=/tmp/projects
PREVIEW_PORT_START=3100
PREVIEW_PORT_END=3999

# Web App Configuration
NEXT_PUBLIC_API_BASE=https://your-api-domain.vercel.app
```

#### Optional Environment Variables

```bash
# AI Service API Keys (can also be set via UI)
CLAUDE_API_KEY=your_claude_api_key
CURSOR_API_KEY=your_cursor_api_key
OPENAI_API_KEY=your_openai_api_key
GOOGLE_API_KEY=your_google_api_key
QWEN_API_KEY=your_qwen_api_key

# GitHub Integration
GITHUB_TOKEN=your_github_token

# Supabase Integration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Vercel Integration
VERCEL_TOKEN=your_vercel_token
```

### Deployment Steps

1. **Connect Repository to Vercel**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "New Project"
   - Import your GitHub repository

2. **Configure Build Settings**
   - Framework Preset: Next.js
   - Root Directory: `apps/web`
   - Build Command: `npm run build`
   - Output Directory: `.next`

3. **Set Environment Variables**
   - Go to Project Settings → Environment Variables
   - Add all required environment variables
   - Set them for Production, Preview, and Development

4. **Deploy API Separately**
   - Create a second Vercel project for the API
   - Root Directory: `apps/api`
   - Framework Preset: Python
   - Build Command: `pip install -r requirements.txt`

5. **Update API Base URL**
   - Set `NEXT_PUBLIC_API_BASE` to your API deployment URL

### Database Setup

For production, use a PostgreSQL database:

1. **Supabase (Recommended)**
   - Create a new Supabase project
   - Get connection string from Settings → Database
   - Set as `DATABASE_URL`

2. **Other PostgreSQL Providers**
   - Neon, PlanetScale, or any PostgreSQL provider
   - Use connection string format: `postgresql://user:pass@host:port/db`

### Security Considerations

1. **API Keys**
   - Never commit API keys to repository
   - Use Vercel environment variables
   - Consider using the built-in API key management UI

2. **Database**
   - Use connection pooling for production
   - Enable SSL connections
   - Regular backups

3. **CORS**
   - Configure CORS for your domain
   - Restrict API access to your frontend domain

### Monitoring

1. **Vercel Analytics**
   - Enable Vercel Analytics for performance monitoring
   - Monitor API response times

2. **Error Tracking**
   - Consider integrating Sentry or similar service
   - Monitor API errors and performance

### Troubleshooting

1. **Build Failures**
   - Check Node.js version compatibility
   - Verify all dependencies are in package.json
   - Check for TypeScript errors

2. **API Issues**
   - Verify environment variables are set
   - Check database connectivity
   - Monitor Vercel function logs

3. **Database Issues**
   - Verify connection string format
   - Check database permissions
   - Monitor connection limits

### Production Checklist

- [ ] All environment variables configured
- [ ] Database connection tested
- [ ] API keys set via UI or environment variables
- [ ] CORS configured properly
- [ ] SSL certificates valid
- [ ] Monitoring and logging enabled
- [ ] Backup strategy implemented
- [ ] Performance testing completed
- [ ] Security audit performed

### Support

For deployment issues:
1. Check Vercel function logs
2. Verify environment variables
3. Test API endpoints manually
4. Check database connectivity
5. Review error messages in browser console