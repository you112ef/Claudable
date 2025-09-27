# Vercel Deployment Troubleshooting Guide

## Common Issues and Solutions

### 1. Build Failures

#### Python API Build Issues
**Problem**: Python dependencies fail to install
**Solutions**:
- Use `requirements-vercel.txt` instead of `requirements.txt`
- Remove heavy dependencies like `docker`, `rich`, `aiohttp`
- Check Python version compatibility (Vercel uses Python 3.9+)

**Problem**: Import errors in Python code
**Solutions**:
- Ensure all imports are relative to the app directory
- Check that all required modules are in requirements.txt
- Verify file structure matches import paths

#### Next.js Build Issues
**Problem**: TypeScript compilation errors
**Solutions**:
- Run `npm run type-check` locally first
- Fix any TypeScript errors before deployment
- Check `tsconfig.json` configuration

**Problem**: Missing dependencies
**Solutions**:
- Ensure all dependencies are in `package.json`
- Run `npm install` locally to verify
- Check for peer dependency warnings

### 2. Runtime Errors

#### API Runtime Issues
**Problem**: Database connection failures
**Solutions**:
- Verify `DATABASE_URL` is set correctly
- Check database permissions
- Ensure database is accessible from Vercel

**Problem**: Environment variable issues
**Solutions**:
- Check all required environment variables are set
- Verify variable names match exactly
- Test with `vercel env ls` command

#### Web App Runtime Issues
**Problem**: API calls failing
**Solutions**:
- Verify `NEXT_PUBLIC_API_BASE` is set correctly
- Check CORS configuration
- Test API endpoints directly

### 3. Configuration Issues

#### Monorepo Setup
**Problem**: Incorrect build paths
**Solutions**:
- Use correct root directory in Vercel settings
- Verify `vercel.json` configuration
- Check build commands and output directories

#### Routing Issues
**Problem**: Routes not working correctly
**Solutions**:
- Check `vercel.json` routes configuration
- Verify API and web app routing
- Test both `/api/*` and `/*` routes

### 4. Performance Issues

#### Cold Start Problems
**Solutions**:
- Optimize Python dependencies
- Use connection pooling for database
- Implement proper caching strategies

#### Memory Issues
**Solutions**:
- Increase function memory in `vercel.json`
- Optimize code to use less memory
- Remove unnecessary dependencies

## Debugging Steps

### 1. Check Build Logs
```bash
vercel logs [deployment-url]
```

### 2. Test Locally
```bash
# Test API locally
cd apps/api
python -m uvicorn app.main:app --reload

# Test Web App locally
cd apps/web
npm run dev
```

### 3. Verify Environment Variables
```bash
vercel env ls
```

### 4. Check Function Logs
- Go to Vercel Dashboard
- Select your project
- Go to Functions tab
- Check individual function logs

## Quick Fixes

### Fix 1: Update Vercel Configuration
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
  ]
}
```

### Fix 2: Optimize Python Dependencies
Use `requirements-vercel.txt` with minimal dependencies.

### Fix 3: Set Correct Environment Variables
Ensure these are set in Vercel:
- `DATABASE_URL`
- `NEXT_PUBLIC_API_BASE`
- `API_PORT`
- `PROJECTS_ROOT`

## Deployment Checklist

- [ ] Vercel CLI installed and logged in
- [ ] All environment variables configured
- [ ] Database connection tested
- [ ] API endpoints working
- [ ] Web app can connect to API
- [ ] No TypeScript errors
- [ ] No Python import errors
- [ ] All dependencies compatible
- [ ] Build commands working locally
- [ ] Routes configured correctly

## Getting Help

1. Check Vercel documentation
2. Review function logs in dashboard
3. Test locally first
4. Check environment variables
5. Verify database connectivity
6. Test API endpoints manually