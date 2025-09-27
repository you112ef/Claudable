# Vercel Environment Variables Checklist

## Required Environment Variables for Web App (apps/web)

### Core Configuration
- `NEXT_PUBLIC_API_BASE` - Your API deployment URL (e.g., https://your-api.vercel.app)

### Optional (can be set via UI)
- `NEXT_PUBLIC_APP_NAME` - Application name
- `NEXT_PUBLIC_APP_VERSION` - Application version

## Required Environment Variables for API (apps/api)

### Database
- `DATABASE_URL` - PostgreSQL connection string (e.g., postgresql://user:pass@host:port/db)

### Core API Configuration
- `API_PORT` - API port (default: 8080)
- `PROJECTS_ROOT` - Projects directory (default: /tmp/projects)
- `PREVIEW_PORT_START` - Preview port range start (default: 3100)
- `PREVIEW_PORT_END` - Preview port range end (default: 3999)

### AI Service API Keys (Optional - can be set via UI)
- `CLAUDE_API_KEY` - Claude API key
- `CURSOR_API_KEY` - Cursor API key
- `OPENAI_API_KEY` - OpenAI API key
- `GOOGLE_API_KEY` - Google API key
- `QWEN_API_KEY` - Qwen API key

### External Service Integration
- `GITHUB_TOKEN` - GitHub integration token
- `VERCEL_TOKEN` - Vercel integration token

### Supabase Integration (if using)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key

## Deployment Steps

### 1. Deploy API First
1. Create a new Vercel project for the API
2. Set Root Directory to `apps/api`
3. Set Framework Preset to `Python`
4. Add all API environment variables
5. Deploy and note the API URL

### 2. Deploy Web App
1. Create a new Vercel project for the web app
2. Set Root Directory to `apps/web`
3. Set Framework Preset to `Next.js`
4. Set `NEXT_PUBLIC_API_BASE` to your API URL from step 1
5. Deploy

### 3. Alternative: Single Project Deployment
If you want to deploy both from the root:
1. Set Root Directory to `/` (root)
2. The root `vercel.json` will handle routing
3. Add all environment variables for both web and API
4. Deploy

## Environment Variable Priority
1. Vercel Environment Variables (highest priority)
2. UI-based API key management (if implemented)
3. Default values (lowest priority)

## Security Notes
- Never commit API keys to the repository
- Use Vercel's environment variable encryption
- Consider using the built-in API key management UI
- Rotate keys regularly
- Use different keys for development and production