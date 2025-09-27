# Vercel Deployment - FIXED ✅

## Issues Fixed

### 1. ✅ Corrected API Path in Root Configuration
**Problem**: Root `vercel.json` was pointing to `apps/api/main.py` but the actual file is at `apps/api/app/main.py`
**Fix**: Updated the path in root `vercel.json` to `apps/api/app/main.py`

### 2. ✅ Fixed API Vercel Configuration
**Problem**: API `vercel.json` was pointing to `main.py` instead of `app/main.py`
**Fix**: Updated API `vercel.json` to use correct path `app/main.py`

### 3. ✅ Enhanced Web App Configuration
**Problem**: Missing build configuration in web app
**Fix**: Added `buildCommand` and `outputDirectory` to web app `vercel.json`

### 4. ✅ Created Vercel-Optimized Dependencies
**Problem**: Heavy Python dependencies causing deployment issues
**Fix**: Created `requirements-vercel.txt` with minimal, compatible dependencies

### 5. ✅ Added Deployment Tools
**Fix**: Created deployment script and comprehensive documentation

## Files Modified

1. `/workspace/vercel.json` - Fixed API path
2. `/workspace/apps/api/vercel.json` - Fixed main.py path
3. `/workspace/apps/web/vercel.json` - Added build configuration
4. `/workspace/apps/api/requirements-vercel.txt` - Created optimized dependencies
5. `/workspace/scripts/deploy-vercel.sh` - Created deployment script
6. `/workspace/vercel-env-checklist.md` - Environment variables guide
7. `/workspace/vercel-troubleshooting.md` - Troubleshooting guide

## Next Steps for Deployment

### Option 1: Deploy Both Separately (Recommended)
1. **Deploy API first**:
   ```bash
   cd apps/api
   vercel --prod
   ```
   - Note the API URL

2. **Deploy Web App**:
   ```bash
   cd apps/web
   vercel env add NEXT_PUBLIC_API_BASE production
   # Enter your API URL when prompted
   vercel --prod
   ```

### Option 2: Deploy from Root (Monorepo)
```bash
# From root directory
vercel --prod
```

### Option 3: Use the Deployment Script
```bash
./scripts/deploy-vercel.sh
```

## Required Environment Variables

### For API Deployment
- `DATABASE_URL` - PostgreSQL connection string
- `API_PORT` - API port (default: 8080)
- `PROJECTS_ROOT` - Projects directory (default: /tmp/projects)
- `PREVIEW_PORT_START` - Preview port range start (default: 3100)
- `PREVIEW_PORT_END` - Preview port range end (default: 3999)

### For Web App Deployment
- `NEXT_PUBLIC_API_BASE` - Your API deployment URL

### Optional (can be set via UI)
- `CLAUDE_API_KEY`
- `CURSOR_API_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`
- `QWEN_API_KEY`
- `GITHUB_TOKEN`
- `VERCEL_TOKEN`

## Configuration Summary

### Root vercel.json (Monorepo)
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

### API vercel.json
```json
{
  "version": 2,
  "builds": [
    {
      "src": "app/main.py",
      "use": "@vercel/python"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "app/main.py"
    }
  ]
}
```

### Web App vercel.json
```json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/next"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/$1"
    }
  ],
  "buildCommand": "npm run build",
  "outputDirectory": ".next"
}
```

## Testing Your Deployment

1. **Check API Health**: Visit `https://your-api.vercel.app/health`
2. **Test Web App**: Visit your web app URL
3. **Verify API Connection**: Check browser console for API connection errors
4. **Test Database**: Ensure database operations work correctly

## Troubleshooting

If you encounter issues:
1. Check the troubleshooting guide: `vercel-troubleshooting.md`
2. Review environment variables: `vercel-env-checklist.md`
3. Check Vercel function logs in the dashboard
4. Test locally first with `npm run dev` and `python -m uvicorn app.main:app --reload`

## Success Indicators

✅ API responds at `/health` endpoint
✅ Web app loads without errors
✅ API calls from web app work
✅ Database operations function correctly
✅ All environment variables are set
✅ No build errors in Vercel logs

Your Vercel deployment should now work correctly! 🚀