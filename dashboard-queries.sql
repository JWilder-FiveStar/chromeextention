-- K-12 Network Telemetry Dashboard Queries
-- Use these queries in BigQuery to create dashboards

-- 1. Recent Network Performance Overview
SELECT 
  device.make,
  device.model,
  device.type,
  isp.provider as isp_provider,
  isp.city,
  isp.region,
  speed.downloadMbps,
  speed.uploadMbps,
  speed.pingMs,
  timestamp
FROM telemetry.pubsub_raw 
WHERE DATE(publish_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAYS)
  AND JSON_EXTRACT_SCALAR(data, '$.speed.downloadMbps') IS NOT NULL
ORDER BY publish_time DESC
LIMIT 100;

-- 2. Device Distribution
SELECT 
  JSON_EXTRACT_SCALAR(data, '$.device.make') as device_make,
  JSON_EXTRACT_SCALAR(data, '$.device.model') as device_model,
  JSON_EXTRACT_SCALAR(data, '$.device.type') as device_type,
  JSON_EXTRACT_SCALAR(data, '$.device.os') as operating_system,
  COUNT(*) as device_count
FROM telemetry.pubsub_raw 
WHERE DATE(publish_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAYS)
GROUP BY device_make, device_model, device_type, operating_system
ORDER BY device_count DESC;

-- 3. Network Speed Performance by ISP
SELECT 
  JSON_EXTRACT_SCALAR(data, '$.isp.provider') as isp_provider,
  JSON_EXTRACT_SCALAR(data, '$.isp.city') as city,
  COUNT(*) as test_count,
  AVG(CAST(JSON_EXTRACT_SCALAR(data, '$.speed.downloadMbps') AS FLOAT64)) as avg_download_mbps,
  AVG(CAST(JSON_EXTRACT_SCALAR(data, '$.speed.uploadMbps') AS FLOAT64)) as avg_upload_mbps,
  AVG(CAST(JSON_EXTRACT_SCALAR(data, '$.speed.pingMs') AS FLOAT64)) as avg_ping_ms
FROM telemetry.pubsub_raw 
WHERE DATE(publish_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAYS)
  AND JSON_EXTRACT_SCALAR(data, '$.speed.downloadMbps') IS NOT NULL
GROUP BY isp_provider, city
HAVING test_count >= 5
ORDER BY avg_download_mbps DESC;

-- 4. Site Reachability Issues
SELECT 
  JSON_EXTRACT_SCALAR(reachability_item, '$.url') as website,
  JSON_EXTRACT_SCALAR(data, '$.isp.provider') as isp_provider,
  JSON_EXTRACT_SCALAR(data, '$.device.type') as device_type,
  COUNTIF(JSON_EXTRACT_SCALAR(reachability_item, '$.reachable') = 'false') as failed_tests,
  COUNT(*) as total_tests,
  ROUND(COUNTIF(JSON_EXTRACT_SCALAR(reachability_item, '$.reachable') = 'false') / COUNT(*) * 100, 2) as failure_rate_percent
FROM telemetry.pubsub_raw,
UNNEST(JSON_EXTRACT_ARRAY(data, '$.reachability')) as reachability_item
WHERE DATE(publish_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAYS)
GROUP BY website, isp_provider, device_type
HAVING total_tests >= 10
ORDER BY failure_rate_percent DESC;

-- 5. Geographic Distribution
SELECT 
  JSON_EXTRACT_SCALAR(data, '$.isp.city') as city,
  JSON_EXTRACT_SCALAR(data, '$.isp.region') as region,
  JSON_EXTRACT_SCALAR(data, '$.isp.country') as country,
  COUNT(DISTINCT JSON_EXTRACT_SCALAR(data, '$.publicIp')) as unique_ips,
  COUNT(*) as total_tests,
  AVG(CAST(JSON_EXTRACT_SCALAR(data, '$.speed.downloadMbps') AS FLOAT64)) as avg_download_mbps
FROM telemetry.pubsub_raw 
WHERE DATE(publish_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAYS)
  AND JSON_EXTRACT_SCALAR(data, '$.isp.city') IS NOT NULL
GROUP BY city, region, country
ORDER BY total_tests DESC;

-- 6. Peak Usage Times
SELECT 
  EXTRACT(HOUR FROM publish_time) as hour_of_day,
  EXTRACT(DAYOFWEEK FROM publish_time) as day_of_week,
  COUNT(*) as test_count,
  AVG(CAST(JSON_EXTRACT_SCALAR(data, '$.speed.downloadMbps') AS FLOAT64)) as avg_download_mbps
FROM telemetry.pubsub_raw 
WHERE DATE(publish_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAYS)
  AND JSON_EXTRACT_SCALAR(data, '$.speed.downloadMbps') IS NOT NULL
GROUP BY hour_of_day, day_of_week
ORDER BY hour_of_day, day_of_week;

-- 7. Chromebook vs Other Devices Performance
SELECT 
  CASE 
    WHEN JSON_EXTRACT_SCALAR(data, '$.device.type') = 'chromebook' THEN 'Chromebook'
    ELSE 'Other Devices'
  END as device_category,
  COUNT(*) as test_count,
  AVG(CAST(JSON_EXTRACT_SCALAR(data, '$.speed.downloadMbps') AS FLOAT64)) as avg_download_mbps,
  AVG(CAST(JSON_EXTRACT_SCALAR(data, '$.speed.uploadMbps') AS FLOAT64)) as avg_upload_mbps,
  PERCENTILE_CONT(CAST(JSON_EXTRACT_SCALAR(data, '$.speed.downloadMbps') AS FLOAT64), 0.5) OVER() as median_download_mbps
FROM telemetry.pubsub_raw 
WHERE DATE(publish_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAYS)
  AND JSON_EXTRACT_SCALAR(data, '$.speed.downloadMbps') IS NOT NULL
GROUP BY device_category
ORDER BY avg_download_mbps DESC;
