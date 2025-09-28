#!/bin/bash

# Automatic Vercel Deployment Setup Script
# This script helps set up automatic deployment to Vercel

set -e

echo "🚀 Setting up automatic Vercel deployment..."

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel@latest
fi

# Check if user is logged in
if ! vercel whoami &> /dev/null; then
    echo "❌ Not logged in to Vercel. Please run 'vercel login' first."
    exit 1
fi

echo "✅ Vercel CLI is ready"

# Function to set up GitHub integration
setup_github_integration() {
    echo "🔧 Setting up GitHub integration..."
    
    # Check if we're in a git repository
    if [ ! -d ".git" ]; then
        echo "❌ Not in a git repository. Please initialize git first."
        exit 1
    fi
    
    # Check if GitHub remote exists
    if ! git remote get-url origin &> /dev/null; then
        echo "❌ No GitHub remote found. Please add a GitHub remote:"
        echo "git remote add origin https://github.com/username/repository.git"
        exit 1
    fi
    
    echo "✅ GitHub repository detected"
}

# Function to configure Vercel project
configure_vercel_project() {
    echo "🔧 Configuring Vercel project..."
    
    # Link project if not already linked
    if [ ! -f ".vercel/project.json" ]; then
        echo "📦 Linking Vercel project..."
        vercel link
    fi
    
    # Get project information
    PROJECT_ID=$(jq -r '.projectId' .vercel/project.json 2>/dev/null || echo "")
    ORG_ID=$(jq -r '.orgId' .vercel/project.json 2>/dev/null || echo "")
    
    if [ -z "$PROJECT_ID" ] || [ -z "$ORG_ID" ]; then
        echo "❌ Failed to get project information. Please run 'vercel link' manually."
        exit 1
    fi
    
    echo "✅ Project ID: $PROJECT_ID"
    echo "✅ Org ID: $ORG_ID"
    
    # Create GitHub secrets file
    cat > .github-secrets-template.txt << EOF
# Add these secrets to your GitHub repository:
# Go to: Settings → Secrets and variables → Actions

VERCEL_TOKEN=your_vercel_token_here
VERCEL_ORG_ID=$ORG_ID
VERCEL_PROJECT_ID=$PROJECT_ID

# To get your Vercel token:
# 1. Go to https://vercel.com/account/tokens
# 2. Create a new token
# 3. Copy the token value
EOF
    
    echo "📋 GitHub secrets template created: .github-secrets-template.txt"
}

# Function to set up environment variables
setup_environment_variables() {
    echo "🔧 Setting up environment variables..."
    
    # Create environment variables template
    cat > .env-template.txt << EOF
# Add these environment variables to Vercel:
# Go to: Project Settings → Environment Variables

# Required
DATABASE_URL=postgresql://user:pass@host:port/database
NEXT_PUBLIC_API_BASE=https://your-api-domain.vercel.app

# Optional AI Services
CLAUDE_API_KEY=your_claude_api_key
CURSOR_API_KEY=your_cursor_api_key
OPENAI_API_KEY=your_openai_api_key
GOOGLE_API_KEY=your_google_api_key
QWEN_API_KEY=your_qwen_api_key

# External Services
GITHUB_TOKEN=your_github_token
VERCEL_TOKEN=your_vercel_token
EOF
    
    echo "📋 Environment variables template created: .env-template.txt"
}

# Function to test deployment
test_deployment() {
    echo "🧪 Testing deployment configuration..."
    
    # Check if all required files exist
    required_files=(
        "vercel.json"
        "apps/web/package.json"
        "apps/api/app/main.py"
        "apps/api/requirements-vercel.txt"
        ".github/workflows/auto-deploy.yml"
    )
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            echo "❌ Missing required file: $file"
            exit 1
        fi
    done
    
    echo "✅ All required files present"
    
    # Test build locally
    echo "🔨 Testing local build..."
    cd apps/web
    if npm run build; then
        echo "✅ Web app builds successfully"
    else
        echo "❌ Web app build failed"
        exit 1
    fi
    cd ../..
    
    echo "✅ Deployment configuration is ready!"
}

# Main setup process
echo "Choose setup method:"
echo "1) GitHub Integration (Recommended)"
echo "2) GitHub Actions"
echo "3) Both"

read -p "Enter your choice (1-3): " choice

case $choice in
    1)
        setup_github_integration
        configure_vercel_project
        setup_environment_variables
        test_deployment
        echo ""
        echo "🎉 GitHub Integration setup complete!"
        echo "Next steps:"
        echo "1. Go to Vercel Dashboard and import your repository"
        echo "2. Set up environment variables"
        echo "3. Enable automatic deployments"
        ;;
    2)
        setup_github_integration
        configure_vercel_project
        setup_environment_variables
        test_deployment
        echo ""
        echo "🎉 GitHub Actions setup complete!"
        echo "Next steps:"
        echo "1. Add secrets to GitHub repository"
        echo "2. Push code to trigger deployment"
        ;;
    3)
        setup_github_integration
        configure_vercel_project
        setup_environment_variables
        test_deployment
        echo ""
        echo "🎉 Complete setup finished!"
        echo "You now have both GitHub Integration and GitHub Actions configured."
        ;;
    *)
        echo "❌ Invalid choice. Exiting."
        exit 1
        ;;
esac

echo ""
echo "📖 See AUTO_DEPLOYMENT_SETUP.md for detailed instructions"
echo "🚀 Your automatic deployment is ready!"