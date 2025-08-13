#!/usr/bin/env python3
"""
BigQuery Data Fetcher for K-12 Network Telemetry Dashboard
Fetches real data from your BigQuery table and serves it to the dashboard
"""

import json
import subprocess
import sys
from datetime import datetime, timedelta

def run_bq_query(query):
    """Execute a BigQuery query and return results as JSON"""
    try:
        # Run BigQuery command
        result = subprocess.run([
            '/Users/jwilder/google-cloud-sdk/bin/bq', 'query', 
            '--use_legacy_sql=false', 
            '--format=json',
            '--max_rows=1000',
            query
        ], capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            return json.loads(result.stdout)
        else:
            print(f"BigQuery Error: {result.stderr}")
            return None
            
    except subprocess.TimeoutExpired:
        print("BigQuery query timed out")
        return None
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {e}")
        return None
    except Exception as e:
        print(f"Error running BigQuery query: {e}")
        return None

def get_telemetry_data():
    """Fetch recent telemetry data from BigQuery"""
    query = """SELECT ingestReceivedAt as publish_time, 
                      device as device_info,
                      trigger 
               FROM `test-email-467802.telemetry.pubsub_raw`
               WHERE DATE(ingestReceivedAt) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
               ORDER BY ingestReceivedAt DESC
               LIMIT 100"""
    
    print("🔍 Querying BigQuery for telemetry data...")
    result = run_bq_query(query)
    if result and len(result) > 0:
        print(f"✅ Found {len(result)} telemetry records")
        return result
    else:
        print("❌ No telemetry data returned from query")

def get_summary_stats():
    """Get summary statistics"""
    query = """
    SELECT 
        COUNT(*) as total_tests,
        AVG(CAST(JSON_EXTRACT_SCALAR(speed, '$.downloadMbps') AS FLOAT64)) as avg_download,
        AVG(CAST(JSON_EXTRACT_SCALAR(speed, '$.uploadMbps') AS FLOAT64)) as avg_upload,
        AVG(CAST(JSON_EXTRACT_SCALAR(speed, '$.pingMs') AS FLOAT64)) as avg_ping,
        COUNT(DISTINCT ingestSourceIp) as unique_devices
    FROM `test-email-467802.telemetry.pubsub_raw`
    WHERE DATE(ingestReceivedAt) >= DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
        AND speed IS NOT NULL
    """
    
    print("📊 Getting summary statistics...")
    return run_bq_query(query)

def check_bigquery_access():
    """Check if BigQuery is accessible"""
    try:
        result = subprocess.run(['/Users/jwilder/google-cloud-sdk/bin/bq', 'ls', 'test-email-467802:telemetry'], 
                              capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            print("✅ BigQuery access confirmed")
            return True
        else:
            print(f"❌ BigQuery access failed: {result.stderr}")
            return False
    except Exception as e:
        print(f"❌ BigQuery check failed: {e}")
        return False

def main():
    print("🌐 K-12 Network Telemetry Data Fetcher")
    print("=" * 50)
    
    # Check BigQuery access
    if not check_bigquery_access():
        print("\n❌ Cannot access BigQuery. Please ensure:")
        print("1. gcloud CLI is installed and authenticated")
        print("2. You have access to the test-email-467802 project")
        print("3. Run: gcloud auth application-default login")
        return
    
    # Fetch data
    print("\n📥 Fetching real telemetry data...")
    telemetry_data = get_telemetry_data()
    
    if telemetry_data:
        print(f"✅ Found {len(telemetry_data)} telemetry records")
        
        # Save to file for dashboard
        with open('telemetry_data.json', 'w') as f:
            json.dump(telemetry_data, f, indent=2, default=str)
        print("💾 Data saved to telemetry_data.json")
        
        # Get summary stats
        stats = get_summary_stats()
        if stats and len(stats) > 0:
            stat = stats[0]
            print(f"\n📊 Summary (Last 24 hours):")
            print(f"   Total Tests: {stat.get('total_tests', 0)}")
            
            # Handle potential null values
            avg_download = stat.get('avg_download')
            avg_upload = stat.get('avg_upload') 
            avg_ping = stat.get('avg_ping')
            unique_devices = stat.get('unique_devices', 0)
            
            if avg_download is not None:
                print(f"   Avg Download: {float(avg_download):.1f} Mbps")
            else:
                print(f"   Avg Download: N/A (no speed data)")
                
            if avg_upload is not None:
                print(f"   Avg Upload: {float(avg_upload):.1f} Mbps")
            else:
                print(f"   Avg Upload: N/A (no speed data)")
                
            if avg_ping is not None:
                print(f"   Avg Ping: {float(avg_ping):.1f} ms")
            else:
                print(f"   Avg Ping: N/A (no speed data)")
                
            print(f"   Unique Devices: {unique_devices}")
        
        # Show sample records
        print(f"\n📋 Recent Records:")
        for i, record in enumerate(telemetry_data[:3]):
            print(f"   {i+1}. {record.get('publish_time', 'Unknown')} - "
                  f"{record.get('device_make', 'Unknown')} "
                  f"{record.get('device_type', 'Unknown')} - "
                  f"{record.get('download_speed', 0):.1f} Mbps")
    else:
        print("❌ No telemetry data found. Possible issues:")
        print("1. No data has been collected yet")
        print("2. Extension not sending data to BigQuery")
        print("3. BigQuery table is empty")
        print("\n💡 Try running your Chrome extension speed test first!")

if __name__ == '__main__':
    main()
