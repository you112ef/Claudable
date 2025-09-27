#!/bin/bash

# Vercel Deployment Script for Claudable
# This script helps deploy both the web app and API to Vercel

set -e

echo "🚀 Starting Vercel deployment process..."

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Please install it first:"
    echo "npm i -g vercel"
    exit 1
fi

# Check if user is logged in
if ! vercel whoami &> /dev/null; then
    echo "❌ Not logged in to Vercel. Please run 'vercel login' first."
    exit 1
fi

echo "✅ Vercel CLI is ready"

# Function to deploy API
deploy_api() {
    echo "📦 Deploying API..."
    cd apps/api
    
    # Use the Vercel-optimized requirements file
    if [ -f "requirements-vercel.txt" ]; then
        cp requirements-vercel.txt requirements.txt
        echo "✅ Using Vercel-optimized requirements"
    fi
    
    # Deploy API
    vercel --prod
    
    # Get the API URL
    API_URL=$(vercel ls | grep -o 'https://[^[:space:]]*' | head -1)
    echo "🌐 API deployed at: $API_URL"
    
    cd ../..
}

# Function to deploy Web App
deploy_web() {
    echo "📦 Deploying Web App..."
    cd apps/web
    
    # Set the API base URL if provided
    if [ ! -z "$API_URL" ]; then
        echo "🔧 Setting NEXT_PUBLIC_API_BASE to $API_URL"
        vercel env add NEXT_PUBLIC_API_BASE production <<< "$API_URL"
    fi
    
    # Deploy Web App
    vercel --prod
    
    # Get the Web URL
    WEB_URL=$(vercel ls | grep -o 'https://[^[:space:]]*' | head -1)
    echo "🌐 Web App deployed at: $WEB_URL"
    
    cd ../..
}

# Main deployment logic
echo "Choose deployment option:"
echo "1) Deploy API only"
echo "2) Deploy Web App only"
echo "3) Deploy both (recommended)"
echo "4) Deploy from root (monorepo)"

read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        deploy_api
        ;;
    2)
        deploy_web
        ;;
    3)
        deploy_api
        deploy_web
        ;;
    4)
        echo "📦 Deploying from root (monorepo setup)..."
        vercel --prod
        ;;
    *)
        echo "❌ Invalid choice. Exiting."
        exit 1
        ;;
esac

echo "✅ Deployment completed!"
echo ""
echo "📋 Next steps:"
echo "1. Set up environment variables in Vercel dashboard"
echo "2. Configure database connection"
echo "3. Add API keys for AI services"
echo "4. Test the deployment"
echo ""
echo "📖 See vercel-env-checklist.md for detailed environment variable setup"