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
    
    def serve_data(self):
        """Fetch data from BigQuery and return as JSON"""
        try:
            print("[serve_data] entered path=", self.path)
            # Cache TTL (seconds)
            CACHE_TTL = 60
            # Allow bypassing cache with ?fresh=1
            parsed = urlparse(self.path)
            qs = parse_qs(parsed.query)
            force_fresh = qs.get('fresh', ['0'])[0] == '1'
            print(f"[serve_data] force_fresh={force_fresh}")
            if not force_fresh and os.path.exists('telemetry_data.json'):
                age = (int(__import__('time').time()) - int(os.path.getmtime('telemetry_data.json')))
                if age < CACHE_TTL:
                    print(f"📊 Loading cached telemetry data (age {age}s < {CACHE_TTL}s)...")
                    with open('telemetry_data.json', 'r') as f:
                        data = json.load(f)
                        if data:
                            print(f"✅ Serving {len(data)} cached telemetry records")
                            self.send_json_response(data)
                            return
            
            # Try to fetch fresh data from BigQuery
            print("🔍 Fetching fresh data from BigQuery...")
            query = """
            SELECT 
                ingestReceivedAt AS publish_time,
                timestamp AS test_timestamp,
                trigger,
                durationMs,
                version,
                speed,
                reachability,
                device,
                ingestSourceIp,
                requestId
            FROM `test-email-467802.telemetry.pubsub_raw`
            ORDER BY ingestReceivedAt DESC
            LIMIT 500
            """
            print("[serve_data] running bq query len=", len(query))
            
            # Execute BigQuery query (requires gcloud auth)
            env = os.environ.copy()
            sdk_bin = '/Users/jwilder/google-cloud-sdk/bin'
            env['PATH'] = f"{sdk_bin}:{env.get('PATH','')}"
            env.setdefault('CLOUDSDK_ROOT_DIR', '/Users/jwilder/google-cloud-sdk')
            result = subprocess.run([
                '/Users/jwilder/google-cloud-sdk/bin/bq', 'query', '--use_legacy_sql=false', '--format=json', '--max_rows=100', query
            ], capture_output=True, text=True, timeout=30, env=env)
            print("[serve_data] bq returncode=", result.returncode)
            if result.stderr:
                print("[serve_data] stderr=", result.stderr[:300])
            if result.stdout:
                print("[serve_data] stdout snippet=", result.stdout[:120])
            
            if result.returncode == 0:
                rows = json.loads(result.stdout)
                if isinstance(rows, list) and rows:
                    enriched = []
                    for r in rows:
                        if not isinstance(r, dict):
                            continue
                        def parse_or_none(raw):
                            if not raw or not isinstance(raw, str):
                                return None
                            try:
                                return json.loads(raw)
                            except Exception:
                                return None
                        speed_obj = parse_or_none(r.get('speed')) or {}
                        reach_obj = parse_or_none(r.get('reachability')) or {}
                        device_obj = parse_or_none(r.get('device')) or {}
                        dev_meta = {}
                        isp_meta = {}
                        if isinstance(device_obj, dict):
                            inner_dev = device_obj.get('device')
                            if isinstance(inner_dev, dict):
                                dev_meta = inner_dev
                            isp = device_obj.get('isp')
                            if isinstance(isp, dict):
                                isp_meta = isp
                        reach_results_raw = reach_obj.get('results') if isinstance(reach_obj, dict) else []
                        reach_results = reach_results_raw if isinstance(reach_results_raw, list) else []
                        sites_total = len(reach_results)
                        sites_ok = sum(1 for x in reach_results if isinstance(x, dict) and ((x.get('ok') is True) or (x.get('status') == 200 and x.get('error') is None)))
                        # Coerce numeric speed metrics
                        def num(val):
                            try:
                                if val is None: return None
                                if isinstance(val, (int,float)): return val
                                return float(val)
                            except Exception:
                                return None
                        download_speed = num(speed_obj.get('downloadMbps'))
                        upload_speed = num(speed_obj.get('uploadMbps'))
                        ping_ms = num(speed_obj.get('pingMs') or speed_obj.get('pingMs'.lower()))
                        # Extract OS info if available
                        os_name = dev_meta.get('os') if isinstance(dev_meta, dict) else None
                        os_version = dev_meta.get('osVersion') if isinstance(dev_meta, dict) else None
                        # Extract user if present inside device_obj.user or device_obj.device.user
                        user_email = None
                        if isinstance(device_obj, dict):
                            possible_user = device_obj.get('user')
                            if isinstance(possible_user, dict):
                                user_email = possible_user.get('email')
                        enriched.append({
                            'publish_time': r.get('publish_time'),
                            'trigger': r.get('trigger'),
                            'version': r.get('version'),
                            'duration_ms': r.get('durationMs'),
                            'user_email': user_email,
                            'device_make': dev_meta.get('make') if isinstance(dev_meta, dict) and dev_meta.get('make') else 'Unknown',
                            'device_type': dev_meta.get('type') if isinstance(dev_meta, dict) and dev_meta.get('type') else 'Unknown',
                            'device_os': os_name or 'Unknown',
                            'device_os_version': os_version or 'Unknown',
                            'isp_provider': isp_meta.get('provider') if isinstance(isp_meta, dict) and isp_meta.get('provider') else 'Unknown',
                            'city': isp_meta.get('city') if isinstance(isp_meta, dict) and isp_meta.get('city') else 'Unknown',
                            'download_speed': download_speed if download_speed is not None else 0,
                            'upload_speed': upload_speed if upload_speed is not None else 0,
                            'ping_ms': ping_ms if ping_ms is not None else 0,
                            'sites_ok': sites_ok,
                            'sites_total': sites_total,
                            'request_id': r.get('requestId')
                        })
                    print(f"✅ Fetched {len(enriched)} real records from BigQuery")
                    with open('telemetry_data.json', 'w') as f:
                        json.dump(enriched, f, indent=2, default=str)
                    self.send_json_response(enriched)
                    return
                else:
                    print("❌ BigQuery returned empty results")
            else:
                print(f"❌ BigQuery query failed: {result.stderr}")
                
        except Exception as e:
            print(f"❌ Error fetching data: {e}")
        
        # Fallback to sample data with clear warning
        print("⚠️  No real data available - using sample data")
        self.send_sample_data()

    # --- New helper methods for reachability drill-down ---
    def run_bq(self, query):
        env = os.environ.copy()
        sdk_bin = '/Users/jwilder/google-cloud-sdk/bin'
        env['PATH'] = f"{sdk_bin}:{env.get('PATH','')}"
        env.setdefault('CLOUDSDK_ROOT_DIR', '/Users/jwilder/google-cloud-sdk')
        result = subprocess.run([
            '/Users/jwilder/google-cloud-sdk/bin/bq', 'query', '--use_legacy_sql=false', '--format=json', query
        ], capture_output=True, text=True, timeout=30, env=env)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip())
        return json.loads(result.stdout)

    def do_GET(self):  # override to add new endpoints
        if self.path == '/api/data' or self.path.startswith('/api/data?'):
            self.serve_data()
            return
        if self.path.startswith('/api/raw'):
            self.serve_raw()
            return
        if self.path.startswith('/api/reachability/summary'):
            self.serve_reachability_summary()
            return
        if self.path.startswith('/api/reachability/site'):
            self.serve_reachability_site()
            return
        super().do_GET()

    def serve_reachability_summary(self):
        try:
            query = """
            WITH expanded AS (
              SELECT 
                JSON_VALUE(r,'$.url') AS url,
                JSON_VALUE(r,'$.ok') = 'true' AS ok,
                CAST(JSON_VALUE(r,'$.latencyMs') AS FLOAT64) AS latency_ms,
                ingestReceivedAt AS ts
              FROM `test-email-467802.telemetry.pubsub_raw`,
              UNNEST(JSON_QUERY_ARRAY(reachability, '$.results')) r
              WHERE ingestReceivedAt >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
            )
            SELECT 
              url,
              COUNT(*) total_checks,
              SUM(CASE WHEN ok THEN 1 ELSE 0 END) ok_checks,
              ROUND(100 * SUM(CASE WHEN ok THEN 1 ELSE 0 END)/COUNT(*),2) AS availability_pct,
              ROUND(AVG(latency_ms),2) AS avg_latency_ms,
              ROUND(MAX(latency_ms),2) AS max_latency_ms,
              ROUND(MIN(latency_ms),2) AS min_latency_ms,
              MAX(ts) AS last_seen
            FROM expanded
            GROUP BY url
            ORDER BY availability_pct ASC, url
            """
            data = self.run_bq(query)
            self.send_json_response(data)
        except Exception as e:
            self.send_error_json(str(e))

    def serve_reachability_site(self):
        try:
            parsed = urlparse(self.path)
            qs = parse_qs(parsed.query)
            url = qs.get('url', [None])[0]
            if not url:
                self.send_error_json('missing url param')
                return
            # Parameter embedding with simple escaping (trusted internal tool usage)
            safe_url = url.replace('"', '')
            query = f"""
            SELECT 
              ingestReceivedAt AS ts,
              requestId,
              JSON_VALUE(r,'$.url') AS url,
              JSON_VALUE(r,'$.ok') = 'true' AS ok,
              JSON_VALUE(r,'$.error') AS error,
              CAST(JSON_VALUE(r,'$.status') AS INT64) AS status,
              CAST(JSON_VALUE(r,'$.latencyMs') AS FLOAT64) AS latency_ms
            FROM `test-email-467802.telemetry.pubsub_raw`,
            UNNEST(JSON_QUERY_ARRAY(reachability, '$.results')) r
            WHERE JSON_VALUE(r,'$.url') = '{safe_url}'
            ORDER BY ts DESC
            LIMIT 200
            """
            data = self.run_bq(query)
            self.send_json_response(data)
        except Exception as e:
            self.send_error_json(str(e))

    def serve_raw(self):
        """Return raw latest rows from BigQuery for debugging."""
        try:
            query = """
            SELECT ingestReceivedAt, trigger, speed, reachability, device, requestId
            FROM `test-email-467802.telemetry.pubsub_raw`
            ORDER BY ingestReceivedAt DESC
            LIMIT 50
            """
            data = self.run_bq(query)
            self.send_json_response(data)
        except Exception as e:
            self.send_error_json(str(e))

    def send_error_json(self, message, code=500):
        self.send_response(code)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({ 'error': message }).encode())
    
    def send_json_response(self, data):
        """Send JSON response with proper headers"""
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, default=str).encode())
    
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
        self.wfile.write(json.dumps(sample_data, default=str).encode())

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
