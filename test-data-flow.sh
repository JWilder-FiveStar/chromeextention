#!/bin/bash

# Simple test to check if the Chrome extension is sending data
echo "🧪 Testing Chrome Extension Data Flow"
echo "======================================"

# Check if extension is loaded by testing the Cloud Run endpoint
echo "🌐 Testing Cloud Run ingest endpoint..."

# Test with a sample telemetry payload
test_payload='{
    "device": {
        "make": "Apple",
        "model": "MacBook Pro",
        "type": "laptop",
        "os": "macOS",
        "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    },
    "speed": {
        "downloadMbps": 85.4,
        "uploadMbps": 23.7,
        "pingMs": 18.2
    },
    "isp": {
        "provider": "Comcast",
        "city": "San Francisco",
        "region": "California",
        "country": "US"
    },
    "publicIp": "192.168.1.100",
    "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
    "trigger": "manual_test",
    "version": "1.0.0",
    "durationMs": 5000,
    "reachability": null,
    "_ingest": {
        "receivedAt": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
        "sourceIp": "192.168.1.100",
        "requestId": "'$(uuidgen | tr '[:upper:]' '[:lower:]')'"
    }
}'

echo "📤 Sending test payload to Cloud Run..."
response=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: 2DiB5JZ6dA4h24lbBgm/BuGS4+VfGL5AgTg0XzMhAME=" \
    -d "$test_payload" \
    https://chromeextention-454431786636.us-east5.run.app/telemetry)

http_code=$(echo "$response" | tail -n1)
response_body=$(echo "$response" | sed '$d')

echo "📊 Response Code: $http_code"
echo "📝 Response Body: $response_body"

if [ "$http_code" = "202" ]; then
    echo "✅ Test payload sent successfully!"
    echo "🔄 Waiting 10 seconds for data to process..."
    sleep 10
    
    echo "🔍 Checking BigQuery for new data..."
    export PATH="/Users/jwilder/google-cloud-sdk/bin:$PATH"
    python3 fetch-data.py
else
    echo "❌ Test failed with HTTP $http_code"
    echo "   Make sure your Cloud Run service is deployed and the API key is correct"
fi
