# Automatic Vercel Deployment Setup

## Overview
This guide will help you set up automatic deployment to Vercel whenever you push code to your GitHub repository.

## Setup Methods

### Method 1: Vercel GitHub Integration (Recommended)

#### Step 1: Connect GitHub to Vercel
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import your GitHub repository
4. Vercel will automatically detect your project structure

#### Step 2: Configure Project Settings
- **Framework Preset**: Other (for monorepo)
- **Root Directory**: `/` (root)
- **Build Command**: `npm run build` (for web app)
- **Output Directory**: `apps/web/.next`

#### Step 3: Set Environment Variables
Add these in Vercel Project Settings → Environment Variables:

**Required:**
```
DATABASE_URL=your_postgresql_connection_string
NEXT_PUBLIC_API_BASE=https://your-api-domain.vercel.app
```

**Optional:**
```
CLAUDE_API_KEY=your_claude_key
CURSOR_API_KEY=your_cursor_key
OPENAI_API_KEY=your_openai_key
GITHUB_TOKEN=your_github_token
VERCEL_TOKEN=your_vercel_token
```

#### Step 4: Enable Automatic Deployments
- Go to Project Settings → Git
- Enable "Automatic deployments"
- Select branches: `main`, `master`

### Method 2: GitHub Actions (Advanced)

#### Step 1: Set up GitHub Secrets
Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these secrets:
```
VERCEL_TOKEN=your_vercel_token
VERCEL_ORG_ID=your_org_id
VERCEL_PROJECT_ID=your_project_id
```

#### Step 2: Get Vercel Credentials
```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Link your project
vercel link

# Get your credentials
vercel env ls
```

#### Step 3: Configure Workflow
The GitHub Actions workflow is already created in `.github/workflows/auto-deploy.yml`

## Configuration Files

### Root vercel.json
```json
{
  "version": 2,
  "builds": [
    {
      "src": "apps/web/package.json",
      "use": "@vercel/next"
    },
    {
      "src": "apps/api/app/main.py",
      "use": "@vercel/python"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/apps/api/app/main.py"
    },
    {
      "src": "/(.*)",
      "dest": "/apps/web/$1"
    }
  ],
  "github": {
    "enabled": true,
    "autoAlias": true
  },
  "git": {
    "deploymentEnabled": {
      "main": true,
      "master": true
    }
  }
}
```

### GitHub Actions Workflow
The workflow automatically:
- Builds your project
- Deploys to Vercel
- Handles both API and Web app
- Supports preview deployments for PRs

## Deployment Triggers

### Automatic Deployment
- **Push to main/master**: Production deployment
- **Pull Request**: Preview deployment
- **Push to other branches**: Preview deployment

### Manual Deployment
```bash
# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

## Environment Variables

### Production Environment
Set these in Vercel Dashboard → Project Settings → Environment Variables:

```
# Database
DATABASE_URL=postgresql://user:pass@host:port/db

# API Configuration
API_PORT=8080
PROJECTS_ROOT=/tmp/projects
PREVIEW_PORT_START=3100
PREVIEW_PORT_END=3999

# Web App
NEXT_PUBLIC_API_BASE=https://your-api.vercel.app

# AI Services (Optional)
CLAUDE_API_KEY=your_key
CURSOR_API_KEY=your_key
OPENAI_API_KEY=your_key
GOOGLE_API_KEY=your_key
QWEN_API_KEY=your_key

# External Services
GITHUB_TOKEN=your_token
VERCEL_TOKEN=your_token
```

## Testing Automatic Deployment

### Test 1: Push to Main
```bash
git add .
git commit -m "Test automatic deployment"
git push origin main
```

### Test 2: Create Pull Request
1. Create a new branch
2. Make changes
3. Create a pull request
4. Check for preview deployment

### Test 3: Check Deployment Status
- Go to Vercel Dashboard
- Check deployment logs
- Test your application

## Troubleshooting

### Common Issues

#### 1. Build Failures
**Problem**: Python dependencies fail to install
**Solution**: Use `requirements-vercel.txt` with minimal dependencies

#### 2. Environment Variables
**Problem**: Missing environment variables
**Solution**: Check Vercel Dashboard → Environment Variables

#### 3. GitHub Integration
**Problem**: Automatic deployments not working
**Solution**: 
- Check GitHub repository permissions
- Verify Vercel GitHub app is installed
- Check branch protection rules

#### 4. API Connection Issues
**Problem**: Web app can't connect to API
**Solution**: 
- Verify `NEXT_PUBLIC_API_BASE` is set correctly
- Check API deployment status
- Test API endpoints directly

### Debug Steps

1. **Check Vercel Logs**
   - Go to Vercel Dashboard
   - Select your project
   - Check Function Logs

2. **Test Locally**
   ```bash
   # Test API
   cd apps/api
   python -m uvicorn app.main:app --reload
   
   # Test Web App
   cd apps/web
   npm run dev
   ```

3. **Check GitHub Actions**
   - Go to GitHub → Actions tab
   - Check workflow runs
   - Review logs for errors

## Success Indicators

✅ Automatic deployment triggers on push
✅ Preview deployments work for PRs
✅ Production deployments work for main branch
✅ Environment variables are set correctly
✅ API and Web app communicate properly
✅ No build errors in logs

## Next Steps

1. **Set up monitoring**: Enable Vercel Analytics
2. **Configure domains**: Add custom domains if needed
3. **Set up notifications**: Configure deployment notifications
4. **Performance optimization**: Monitor and optimize deployment times

Your automatic Vercel deployment is now configured! 🚀