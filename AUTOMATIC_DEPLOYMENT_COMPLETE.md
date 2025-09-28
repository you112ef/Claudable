# ✅ Automatic Vercel Deployment - COMPLETE SETUP

## What's Been Configured

### 1. ✅ GitHub Actions Workflows
- **`.github/workflows/auto-deploy.yml`** - Main automatic deployment workflow
- **`.github/workflows/deploy-vercel.yml`** - Advanced deployment with separate API/Web jobs
- **`.github/workflows/vercel-webhook.yml`** - Webhook-based deployment

### 2. ✅ Vercel Configuration
- **`vercel.json`** - Updated with GitHub integration settings
- **`apps/api/vercel.json`** - API-specific configuration
- **`apps/web/vercel.json`** - Web app configuration

### 3. ✅ Deployment Scripts
- **`scripts/setup-auto-deploy.sh`** - Automated setup script
- **`scripts/deploy-vercel.sh`** - Manual deployment script

### 4. ✅ Documentation
- **`AUTO_DEPLOYMENT_SETUP.md`** - Complete setup guide
- **`SECRETS_SETUP.md`** - Secrets and environment variables guide
- **`vercel-troubleshooting.md`** - Troubleshooting guide

## Quick Start Guide

### Option 1: Vercel GitHub Integration (Easiest)

1. **Connect Repository to Vercel**
   ```bash
   # Go to https://vercel.com/dashboard
   # Click "New Project"
   # Import your GitHub repository
   ```

2. **Configure Project Settings**
   - Framework: Other (monorepo)
   - Root Directory: `/`
   - Build Command: `npm run build`
   - Output Directory: `apps/web/.next`

3. **Set Environment Variables**
   - Go to Project Settings → Environment Variables
   - Add all required variables (see `SECRETS_SETUP.md`)

4. **Enable Automatic Deployments**
   - Go to Project Settings → Git
   - Enable "Automatic deployments"
   - Select branches: `main`, `master`

### Option 2: GitHub Actions (Advanced)

1. **Set up GitHub Secrets**
   ```bash
   # Go to GitHub → Settings → Secrets and variables → Actions
   # Add: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID
   ```

2. **Get Vercel Credentials**
   ```bash
   npm install -g vercel
   vercel login
   vercel link
   cat .vercel/project.json
   ```

3. **Push Code to Trigger Deployment**
   ```bash
   git add .
   git commit -m "Enable automatic deployment"
   git push origin main
   ```

### Option 3: Automated Setup Script

```bash
# Run the setup script
./scripts/setup-auto-deploy.sh

# Follow the prompts to configure everything
```

## Deployment Triggers

### Automatic Triggers
- ✅ **Push to main/master** → Production deployment
- ✅ **Pull Request** → Preview deployment
- ✅ **Push to other branches** → Preview deployment

### Manual Triggers
```bash
# Deploy to preview
vercel

# Deploy to production
vercel --prod

# Deploy specific project
cd apps/web && vercel --prod
cd apps/api && vercel --prod
```

## Environment Variables Required

### Core Variables
```
DATABASE_URL=postgresql://user:pass@host:port/database
NEXT_PUBLIC_API_BASE=https://your-api.vercel.app
API_PORT=8080
PROJECTS_ROOT=/tmp/projects
```

### AI Service Keys (Optional)
```
CLAUDE_API_KEY=your_key
CURSOR_API_KEY=your_key
OPENAI_API_KEY=your_key
GOOGLE_API_KEY=your_key
QWEN_API_KEY=your_key
```

### External Services
```
GITHUB_TOKEN=your_token
VERCEL_TOKEN=your_token
```

## Testing Your Setup

### Test 1: Check Configuration
```bash
# Verify all files exist
ls -la .github/workflows/
ls -la vercel.json
ls -la apps/*/vercel.json

# Test Vercel CLI
vercel whoami
```

### Test 2: Test Local Build
```bash
# Test web app build
cd apps/web
npm run build

# Test API dependencies
cd ../api
pip install -r requirements-vercel.txt
```

### Test 3: Test Deployment
```bash
# Test preview deployment
vercel

# Test production deployment
vercel --prod
```

### Test 4: Test Automatic Deployment
```bash
# Make a small change
echo "# Test" >> README.md
git add .
git commit -m "Test automatic deployment"
git push origin main

# Check Vercel dashboard for deployment
```

## Monitoring Your Deployments

### Vercel Dashboard
- Go to [Vercel Dashboard](https://vercel.com/dashboard)
- Select your project
- Check "Deployments" tab
- Monitor function logs

### GitHub Actions
- Go to GitHub → Actions tab
- Check workflow runs
- Review logs for errors

### Health Checks
- **API Health**: `https://your-api.vercel.app/health`
- **Web App**: `https://your-web.vercel.app`
- **API Connection**: Check browser console

## Troubleshooting

### Common Issues

#### 1. Build Failures
- Check Vercel function logs
- Verify all dependencies are compatible
- Test local builds first

#### 2. Environment Variables
- Check Vercel dashboard settings
- Verify variable names match exactly
- Test with `vercel env ls`

#### 3. GitHub Integration
- Check repository permissions
- Verify Vercel GitHub app is installed
- Check branch protection rules

#### 4. API Connection Issues
- Verify `NEXT_PUBLIC_API_BASE` is set correctly
- Check API deployment status
- Test API endpoints directly

### Debug Commands
```bash
# Check Vercel status
vercel whoami
vercel project ls
vercel env ls

# Check GitHub Actions
gh run list
gh run view [run-id]

# Test local deployment
vercel --debug
```

## Success Indicators

✅ **Automatic deployment triggers** on push to main
✅ **Preview deployments work** for pull requests
✅ **Production deployments work** for main branch
✅ **Environment variables are set** correctly
✅ **API and Web app communicate** properly
✅ **No build errors** in logs
✅ **Health checks pass**
✅ **Database operations work**

## Next Steps

1. **Monitor deployments** in Vercel dashboard
2. **Set up custom domains** if needed
3. **Configure notifications** for deployment status
4. **Optimize performance** based on usage
5. **Set up monitoring** and alerting

## Files Created/Modified

### New Files
- `.github/workflows/auto-deploy.yml`
- `.github/workflows/deploy-vercel.yml`
- `.github/workflows/vercel-webhook.yml`
- `scripts/setup-auto-deploy.sh`
- `AUTO_DEPLOYMENT_SETUP.md`
- `SECRETS_SETUP.md`
- `AUTOMATIC_DEPLOYMENT_COMPLETE.md`

### Modified Files
- `vercel.json` - Added GitHub integration
- `apps/api/vercel.json` - Fixed paths
- `apps/web/vercel.json` - Added build settings

## Your Automatic Deployment is Ready! 🚀

Your Vercel deployment will now automatically trigger whenever you:
- Push code to the main branch
- Create a pull request
- Push to any branch (for preview deployments)

The system is configured to handle both your API and web app deployments seamlessly!