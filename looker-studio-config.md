# K-12 Network Telemetry Dashboard Configuration
# Use this as a reference when setting up your Looker Studio dashboard

## Data Source Configuration
- **Source**: BigQuery
- **Project**: test-email-467802  
- **Dataset**: telemetry
- **Table**: pubsub_raw

## Key Metrics Configuration

### Primary KPIs (Scorecards)
1. **Average Download Speed**: AVG(Download Speed (Mbps)) - Last 7 days
2. **Average Upload Speed**: AVG(Upload Speed (Mbps)) - Last 7 days  
3. **Average Ping**: AVG(Ping (ms)) - Last 7 days
4. **Total Devices**: COUNT_DISTINCT(JSON_EXTRACT_SCALAR(data, '$.publicIp'))
5. **Site Availability**: Site Reachability Success Rate average

### Charts Configuration

#### 1. Network Performance Over Time
- **Chart Type**: Time Series
- **Date Dimension**: publish_time (Date Hour)
- **Metrics**: Download Speed (Mbps), Upload Speed (Mbps), Ping (ms)
- **Filter**: Last 30 days

#### 2. Performance by ISP
- **Chart Type**: Horizontal Bar Chart
- **Dimension**: ISP Provider
- **Metrics**: AVG Download Speed (Mbps), AVG Upload Speed (Mbps)
- **Sort**: By Download Speed descending
- **Filter**: Minimum 10 tests per ISP

#### 3. Device Type Distribution  
- **Chart Type**: Pie Chart
- **Dimension**: Device Type
- **Metric**: Record Count
- **Colors**: Custom (Blue for Chromebook, Green for Desktop, etc.)

#### 4. Geographic Performance Map
- **Chart Type**: Geo Map with Bubbles
- **Geographic Dimension**: Location (or use Latitude/Longitude if available)
- **Metrics**: AVG Download Speed (Mbps)
- **Bubble Size**: Number of tests
- **Bubble Color**: Average speed (green=fast, red=slow)

#### 5. Speed Distribution Histogram
- **Chart Type**: Histogram
- **Dimension**: Download Speed (Mbps) - bucketed
- **Metric**: Record Count
- **Buckets**: 0-5, 5-10, 10-25, 25-50, 50-100, 100+ Mbps

#### 6. Site Reachability Heatmap
- **Chart Type**: Pivot Table with Heatmap
- **Row**: Website URL (extracted from reachability data)
- **Column**: Hour of Day
- **Metric**: Success Rate %
- **Color Scale**: Green (100%) to Red (0%)

#### 7. Device Performance Comparison
- **Chart Type**: Grouped Bar Chart
- **Dimension**: Device Make
- **Metrics**: AVG Download Speed, AVG Upload Speed
- **Group By**: Device Type

#### 8. Network Issues Timeline
- **Chart Type**: Area Chart
- **Date Dimension**: publish_time (Date)
- **Metrics**: Failed Tests Count, Total Tests Count
- **Secondary Axis**: Failure Rate %

## Filter Controls to Add
1. **Date Range Picker**: Default to last 7 days
2. **Device Type Filter**: Multi-select dropdown
3. **ISP Provider Filter**: Multi-select dropdown  
4. **Location Filter**: Text search
5. **Speed Range Filter**: Slider for min/max speeds

## Dashboard Layout Recommendations

### Page 1: Executive Summary
```
[KPI Cards Row]
[Avg Download] [Avg Upload] [Avg Ping] [Total Devices] [Availability %]

[Main Performance Chart]
[Network Performance Over Time - Full Width]

[Secondary Charts Row]  
[Performance by ISP] [Device Type Distribution] [Geographic Map]
```

### Page 2: Technical Details
```
[Filter Controls Row]
[Date Range] [Device Type] [ISP] [Location]

[Detailed Analysis]
[Speed Distribution] [Device Performance] [Site Reachability Heatmap]

[Data Table]
[Detailed Records Table with all metrics]
```

### Page 3: Operational Monitoring
```
[Alert Indicators]
[Low Speed Alerts] [Site Down Alerts] [Device Issues]

[Monitoring Charts]
[Issues Timeline] [Failure Rate by Location] [Peak Usage Times]
```

## Color Scheme Recommendations
- **Primary**: #1976D2 (Blue)
- **Success**: #4CAF50 (Green)  
- **Warning**: #FF9800 (Orange)
- **Error**: #F44336 (Red)
- **Background**: #FAFAFA (Light Gray)

## Refresh Settings
- **Data Freshness**: Refresh every 15 minutes
- **Cache Duration**: 1 hour for performance

## Sharing Configuration
- **View Access**: K-12 IT administrators
- **Edit Access**: Network operations team
- **Schedule Reports**: Daily summary emails
