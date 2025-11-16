#!/bin/bash

# Setup and start local Cashu mints for atomic swap testing

set -e

echo "🚀 Setting up local Cashu mints..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running"
    echo "Please start Docker Desktop and try again"
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Stop and remove existing containers
echo "🧹 Cleaning up existing containers..."
docker-compose down 2>/dev/null || true
echo ""

# Pull latest image
echo "📦 Pulling Nutshell image..."
docker pull cashubtc/nutshell:0.18.0
echo ""

# Start mints
echo "🏃 Starting local mints..."
docker-compose up -d

echo ""
echo "⏳ Waiting for mints to be healthy..."
sleep 5

# Check Mint A
echo ""
echo "Checking Mint A (http://localhost:3338)..."
for i in {1..30}; do
    if curl -s http://localhost:3338/v1/info > /dev/null 2>&1; then
        echo "✅ Mint A is running!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Mint A failed to start"
        docker logs cashu-mint-a
        exit 1
    fi
    sleep 1
done

# Check Mint B
echo ""
echo "Checking Mint B (http://localhost:3339)..."
for i in {1..30}; do
    if curl -s http://localhost:3339/v1/info > /dev/null 2>&1; then
        echo "✅ Mint B is running!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Mint B failed to start"
        docker logs cashu-mint-b
        exit 1
    fi
    sleep 1
done

echo ""
echo "🎉 Local mints are ready!"
echo ""
echo "Mint A: http://localhost:3338"
echo "Mint B: http://localhost:3339"
echo ""
echo "📝 Next steps:"
echo "  1. Run: npx tsx test-local-mints.ts"
echo "  2. Run: npx tsx test-atomic-swap-e2e.ts"
echo ""
echo "To stop mints: docker-compose down"
echo "To view logs: docker-compose logs -f"
