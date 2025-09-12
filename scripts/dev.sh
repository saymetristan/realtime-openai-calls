#!/bin/bash

# Development script for easy local testing
echo "🛠️  Starting development environment..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Run npm run setup first."
    exit 1
fi

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "⚠️  ngrok not found. Installing..."
    npm install -g ngrok
fi

# Start ngrok in background
echo "🌐 Starting ngrok tunnel..."
ngrok http 3000 --log=stdout > ngrok.log 2>&1 &
NGROK_PID=$!

# Wait a moment for ngrok to start
sleep 3

# Get the ngrok URL
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*\.ngrok\.io')

if [ -z "$NGROK_URL" ]; then
    echo "❌ Failed to start ngrok tunnel"
    kill $NGROK_PID 2>/dev/null
    exit 1
fi

echo "✅ ngrok tunnel started: $NGROK_URL"

# Update SERVER_URL in .env
sed -i.bak "s|SERVER_URL=.*|SERVER_URL=$NGROK_URL|" .env

echo "✅ Updated SERVER_URL in .env"
echo ""
echo "🎯 Important webhook URLs for Twilio:"
echo "   SIP Webhook: $NGROK_URL/webhook/twilio/sip"
echo "   Fallback:    $NGROK_URL/webhook/twilio/sip/fallback"
echo ""
echo "📱 Configure these URLs in your Twilio SIP Domain"
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo "🛑 Shutting down..."
    kill $NGROK_PID 2>/dev/null
    echo "✅ ngrok tunnel closed"
    exit 0
}

# Set trap for cleanup
trap cleanup INT TERM

# Start the development server
echo "🚀 Starting development server..."
npm run dev

# This will only run if npm run dev exits
cleanup
