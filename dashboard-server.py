#!/usr/bin/env python3
"""
Simple dashboard server for K-12 Network Telemetry
Fetches data from BigQuery and serves a local dashboard
"""

from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import os
import subprocess
import webbrowser
from urllib.parse import urlparse, parse_qs

class DashboardHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/data':
            self.serve_data()
        else:
            super().do_GET()
    
    def serve_data(self):
        """Fetch data from BigQuery and return as JSON"""
        try:
            # Sample query to get recent data
            query = """
            SELECT 
                publish_time,
                JSON_EXTRACT_SCALAR(data, '$.device.make') as device_make,
                JSON_EXTRACT_SCALAR(data, '$.device.type') as device_type,
                JSON_EXTRACT_SCALAR(data, '$.isp.provider') as isp_provider,
                JSON_EXTRACT_SCALAR(data, '$.isp.city') as city,
                CAST(JSON_EXTRACT_SCALAR(data, '$.speed.downloadMbps') AS FLOAT64) as download_speed,
                CAST(JSON_EXTRACT_SCALAR(data, '$.speed.uploadMbps') AS FLOAT64) as upload_speed,
                CAST(JSON_EXTRACT_SCALAR(data, '$.speed.pingMs') AS FLOAT64) as ping_ms,
                JSON_EXTRACT_SCALAR(data, '$.publicIp') as public_ip
            FROM `test-email-467802.telemetry.pubsub_raw`
            WHERE DATE(publish_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAYS)
            ORDER BY publish_time DESC
            LIMIT 100
            """
            
            # Execute BigQuery query (requires gcloud auth)
            result = subprocess.run([
                'bq', 'query', '--use_legacy_sql=false', '--format=json', query
            ], capture_output=True, text=True)
            
            if result.returncode == 0:
                data = json.loads(result.stdout)
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(data).encode())
            else:
                # Return sample data if BigQuery fails
                self.send_sample_data()
                
        except Exception as e:
            print(f"Error fetching data: {e}")
            self.send_sample_data()
    
    def send_sample_data(self):
        """Send sample data for demonstration"""
        sample_data = [
            {
                "publish_time": "2025-08-13T02:30:00Z",
                "device_make": "Google",
                "device_type": "chromebook", 
                "isp_provider": "Comcast",
                "city": "New York",
                "download_speed": 45.2,
                "upload_speed": 12.8,
                "ping_ms": 28.5,
                "public_ip": "192.168.1.100"
            },
            {
                "publish_time": "2025-08-13T02:25:00Z",
                "device_make": "Apple",
                "device_type": "desktop",
                "isp_provider": "Verizon", 
                "city": "Boston",
                "download_speed": 78.9,
                "upload_speed": 35.2,
                "ping_ms": 18.3,
                "public_ip": "192.168.1.101"
            }
        ]
        
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(sample_data).encode())

def main():
    port = 8000
    
    print(f"🌐 Starting K-12 Network Telemetry Dashboard")
    print(f"📊 Dashboard will be available at: http://localhost:{port}/dashboard.html")
    print(f"🔄 Data API available at: http://localhost:{port}/api/data")
    print(f"📂 Serving from: {os.getcwd()}")
    print(f"⏹️  Press Ctrl+C to stop the server")
    print()
    
    # Start server
    httpd = HTTPServer(('localhost', port), DashboardHandler)
    
    # Open browser automatically
    webbrowser.open(f'http://localhost:{port}/dashboard.html')
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print(f"\n🛑 Dashboard server stopped")
        httpd.shutdown()

if __name__ == '__main__':
    main()
