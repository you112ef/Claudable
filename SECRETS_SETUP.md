# Secrets and Environment Variables Setup

## GitHub Secrets Setup

### Step 1: Get Vercel Credentials

#### Get Vercel Token
1. Go to [Vercel Account Tokens](https://vercel.com/account/tokens)
2. Click "Create Token"
3. Give it a name (e.g., "GitHub Actions")
4. Copy the token value

#### Get Vercel Project Information
```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Link your project
vercel link

# Get project information
cat .vercel/project.json
```

### Step 2: Add GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these secrets:

```
VERCEL_TOKEN=your_vercel_token_here
VERCEL_ORG_ID=your_org_id_here
VERCEL_PROJECT_ID=your_project_id_here
```

### Step 3: Get Credentials from Vercel Dashboard

#### Method 1: From Vercel Dashboard
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to Settings → General
4. Copy:
   - **Project ID**: Found in the project URL
   - **Team ID**: Found in team settings

#### Method 2: From Vercel CLI
```bash
# Get project information
vercel project ls

# Get team information
vercel teams ls
```

## Environment Variables Setup

### Vercel Environment Variables

Go to Vercel Dashboard → Project Settings → Environment Variables

#### Required Variables
```
DATABASE_URL=postgresql://user:pass@host:port/database
NEXT_PUBLIC_API_BASE=https://your-api-domain.vercel.app
API_PORT=8080
PROJECTS_ROOT=/tmp/projects
PREVIEW_PORT_START=3100
PREVIEW_PORT_END=3999
```

#### Optional AI Service Keys
```
CLAUDE_API_KEY=your_claude_api_key
CURSOR_API_KEY=your_cursor_api_key
OPENAI_API_KEY=your_openai_api_key
GOOGLE_API_KEY=your_google_api_key
QWEN_API_KEY=your_qwen_api_key
```

#### External Service Keys
```
GITHUB_TOKEN=your_github_token
VERCEL_TOKEN=your_vercel_token
```

### Environment Variable Priority

1. **Vercel Environment Variables** (highest priority)
2. **GitHub Secrets** (for CI/CD)
3. **Local .env files** (for development)
4. **Default values** (lowest priority)

## Database Setup

### Option 1: Supabase (Recommended)
1. Go to [Supabase](https://supabase.com)
2. Create a new project
3. Go to Settings → Database
4. Copy the connection string
5. Set as `DATABASE_URL`

### Option 2: Neon
1. Go to [Neon](https://neon.tech)
2. Create a new database
3. Copy the connection string
4. Set as `DATABASE_URL`

### Option 3: PlanetScale
1. Go to [PlanetScale](https://planetscale.com)
2. Create a new database
3. Get the connection string
4. Set as `DATABASE_URL`

## AI Service Keys Setup

### Claude API Key
1. Go to [Anthropic Console](https://console.anthropic.com)
2. Create an API key
3. Set as `CLAUDE_API_KEY`

### OpenAI API Key
1. Go to [OpenAI Platform](https://platform.openai.com)
2. Create an API key
3. Set as `OPENAI_API_KEY`

### Google API Key
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable the AI API
3. Create credentials
4. Set as `GOOGLE_API_KEY`

## GitHub Integration Setup

### Step 1: Install Vercel GitHub App
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Go to Settings → Git
3. Connect your GitHub account
4. Install the Vercel GitHub App

### Step 2: Configure Repository Access
1. Select repositories to give Vercel access to
2. Enable automatic deployments
3. Configure branch settings

### Step 3: Set Up Branch Protection
1. Go to GitHub repository → Settings → Branches
2. Add rule for main/master branch
3. Require status checks to pass
4. Include Vercel deployment checks

## Testing Your Setup

### Test 1: Check Secrets
```bash
# Test Vercel CLI
vercel whoami

# Test project access
vercel project ls
```

### Test 2: Test Environment Variables
```bash
# Check Vercel environment variables
vercel env ls
```

### Test 3: Test Deployment
```bash
# Test local deployment
vercel

# Test production deployment
vercel --prod
```

## Troubleshooting

### Common Issues

#### 1. Invalid Token
**Problem**: Vercel token is invalid or expired
**Solution**: 
- Generate a new token
- Update GitHub secrets
- Check token permissions

#### 2. Project Not Found
**Problem**: Vercel project ID is incorrect
**Solution**:
- Check project ID in Vercel dashboard
- Verify project exists
- Check team permissions

#### 3. Environment Variables Not Set
**Problem**: Environment variables are missing
**Solution**:
- Check Vercel dashboard
- Verify variable names
- Check for typos

#### 4. Database Connection Failed
**Problem**: Database URL is incorrect
**Solution**:
- Test connection string locally
- Check database permissions
- Verify network access

### Debug Commands

```bash
# Check Vercel status
vercel whoami

# List projects
vercel project ls

# Check environment variables
vercel env ls

# Test deployment
vercel --debug
```

## Security Best Practices

1. **Never commit secrets** to your repository
2. **Use environment variables** for sensitive data
3. **Rotate keys regularly**
4. **Use different keys** for development and production
5. **Monitor access logs**
6. **Use least privilege principle**

## Quick Setup Checklist

- [ ] Vercel CLI installed and logged in
- [ ] GitHub repository connected to Vercel
- [ ] GitHub secrets configured
- [ ] Environment variables set in Vercel
- [ ] Database connection tested
- [ ] AI service keys configured
- [ ] Automatic deployments enabled
- [ ] Test deployment successful

Your automatic deployment setup is now complete! 🚀