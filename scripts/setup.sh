#!/bin/bash

# Setup script for Realtime OpenAI Calls project
echo "🚀 Setting up Realtime OpenAI Calls project..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Copy environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "📄 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please fill in your API keys in .env file"
else
    echo "✅ .env file already exists"
fi

# Create logs directory
mkdir -p logs
echo "✅ Created logs directory"

# Check if Railway CLI is installed
if command -v railway &> /dev/null; then
    echo "✅ Railway CLI is installed"
else
    echo "⚠️  Railway CLI not found. Install with: npm install -g @railway/cli"
fi

# Check if ngrok is available for development
if command -v ngrok &> /dev/null; then
    echo "✅ ngrok is available for development"
else
    echo "⚠️  ngrok not found. Install with: npm install -g ngrok"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Fill in your API keys in .env file"
echo "2. Configure Twilio SIP Domain"
echo "3. Run 'npm run dev' for development"
echo "4. Run 'railway deploy' for production"
echo ""
