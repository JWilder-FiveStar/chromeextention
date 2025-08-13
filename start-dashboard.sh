#!/bin/bash
# Quick Dashboard Launcher for K-12 Network Telemetry

echo "🚀 Starting K-12 Network Telemetry Dashboard..."
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed."
    echo "📥 Please install Python 3 from https://python.org"
    exit 1
fi

# Make sure we're in the right directory
cd "$(dirname "$0")"

# Check if dashboard files exist
if [ ! -f "dashboard.html" ]; then
    echo "❌ dashboard.html not found in current directory"
    exit 1
fi

echo "✅ Starting dashboard server..."
echo "🌐 Your dashboard will open automatically in your browser"
echo "📊 View real-time network telemetry data"
echo ""
echo "⏹️  Press Ctrl+C to stop the dashboard"
echo ""

# Start the dashboard server
python3 dashboard-server.py
