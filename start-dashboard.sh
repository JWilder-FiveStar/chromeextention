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

# Check for BigQuery CLI and try to fetch real data
if command -v bq &> /dev/null; then
    echo "🔍 Checking for real telemetry data..."
    python3 fetch-data.py
    
    if [ -f "telemetry_data.json" ]; then
        echo "✅ Real telemetry data found - dashboard will show live data!"
    else
        echo "⚠️  No real data available - dashboard will show sample data"
        echo "   Run a speed test in your Chrome extension to generate data"
    fi
else
    echo "⚠️  BigQuery CLI not found - using sample data only"
    echo "   To see real data: gcloud components install bq"
fi

echo ""
echo "✅ Starting dashboard server..."
echo "🌐 Your dashboard will open automatically in your browser"
echo "📊 View real-time network telemetry data"
echo ""
echo "⏹️  Press Ctrl+C to stop the dashboard"
echo ""

# Start the dashboard server
python3 dashboard-server.py
