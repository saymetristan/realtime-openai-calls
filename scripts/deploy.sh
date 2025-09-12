#!/bin/bash

# Deployment script for Railway
echo "🚀 Deploying to Railway..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Check if logged in to Railway
if ! railway status &> /dev/null; then
    echo "🔐 Not logged in to Railway. Please login first:"
    railway login
fi

# Lint code before deployment
echo "🔍 Running linting..."
npm run lint

if [ $? -ne 0 ]; then
    echo "❌ Linting failed. Please fix the issues before deploying."
    exit 1
fi

echo "✅ Linting passed"

# Set production environment variables if not set
echo "⚙️  Checking environment variables..."

# List of required variables
REQUIRED_VARS=(
    "OPENAI_API_KEY"
    "TWILIO_ACCOUNT_SID" 
    "TWILIO_AUTH_TOKEN"
    "TWILIO_PHONE_NUMBER"
    "NODE_ENV"
)

# Check if variables are set in Railway
for var in "${REQUIRED_VARS[@]}"; do
    if railway variables | grep -q "$var"; then
        echo "✅ $var is set"
    else
        echo "❌ $var is not set in Railway"
        echo "   Set it with: railway variables set $var=value"
    fi
done

# Set NODE_ENV to production if not set
if ! railway variables | grep -q "NODE_ENV"; then
    echo "🔧 Setting NODE_ENV to production..."
    railway variables set NODE_ENV=production
fi

# Deploy
echo "🚀 Starting deployment..."
railway deploy

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 Deployment successful!"
    echo ""
    
    # Get the deployment URL
    RAILWAY_URL=$(railway status --json | grep -o '"url":"[^"]*' | cut -d'"' -f4)
    
    if [ ! -z "$RAILWAY_URL" ]; then
        echo "🌐 Your app is live at: $RAILWAY_URL"
        echo ""
        echo "🎯 Update your Twilio SIP Domain with these URLs:"
        echo "   SIP Webhook: $RAILWAY_URL/webhook/twilio/sip"
        echo "   Fallback:    $RAILWAY_URL/webhook/twilio/sip/fallback"
        echo ""
        echo "🔍 Health check: $RAILWAY_URL/health"
    fi
else
    echo "❌ Deployment failed"
    exit 1
fi

echo ""
echo "📊 Monitor your deployment:"
echo "   railway logs --follow"
echo "   railway status"
