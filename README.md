# K12 Network Telemetry Chrome Extension

Manifest V3 extension providing managed-device network telemetry: speed test, site reachability, and periodic reporting.

## Features
- Download, upload, and latency (ping) speed test (simple fetch-based implementation)
- Site reachability checks (HEAD requests) with latency & status
- Device & network telemetry (userAgent, platform, connection info, public IP, optional geolocation)
- Bundled JSON payload POST to configurable endpoint
- Manual trigger via popup + automatic periodic reporting (alarms API)
- Modular code for future expansion

## Files
- `manifest.json` – extension manifest (MV3)
- `background.js` – service worker orchestrating tests & reporting
- `config.js` – configurable constants (endpoint, intervals, URLs)
- `speedTest.js` – download/upload/ping tests
- `reachability.js` – site status checks
- `telemetry.js` – collects device/network/IP/geolocation info
- `reporter.js` – posts JSON payload
- `popup.html` / `popup.js` – simple UI with Run Test button
- `options_placeholder.html` – stub for future admin configuration page

## Installation (Developer Mode)
1. Open Chrome > Extensions > Enable Developer Mode.
2. Click "Load unpacked" and select this folder.
3. Pin the extension (optional), open popup, click "Run Test".

## Configuration
Edit `config.js`:
- `reportingEndpoint`: destination for POST payload.
- `autoReportIntervalMinutes`: interval for automatic runs.
- `reachabilityUrls`: list of sites to probe.
- `speedTest`: parameters and endpoints.

### Continuous Deployment (Git → Cloud Run)

The two backend services deploy automatically via Google Cloud Build triggers so you do NOT run local `gcloud run deploy` for normal changes:

Service | Cloud Run name | Build config | Trigger include filter
--------|----------------|--------------|-----------------------
Processor | `process` | `cloudbuild-processor.yaml` | `backend/processor/**`
Ingest | `chromeextention` | `cloudbuild-ingest.yaml` | `backend/ingest/**`

Steps to set up (one‑time):
1. In Google Cloud Console → Cloud Build → Triggers → Create Trigger.
2. Select repository (GitHub connection) and branch (main).
3. For Processor trigger:
  - Event: Push to branch
  - Include files filter: `backend/processor/**,cloudbuild-processor.yaml`
  - Build config: Existing YAML → path `cloudbuild-processor.yaml`
4. For Ingest trigger:
  - Event: Push to branch
  - Include files filter: `backend/ingest/**,cloudbuild-ingest.yaml`
  - Build config path: `cloudbuild-ingest.yaml`
5. Add required secrets:
  - Processor: Secret Manager secret `telemetry-bucket` mapped to env var `BUCKET`.
  - Ingest: Secret `telemetry-api-key` mapped to env var `API_KEY`.
6. Ensure Cloud Build service account has roles: Cloud Run Admin, Service Account User, Secret Manager Accessor, Pub/Sub Publisher (for ingest service image build steps not required but safe), and BigQuery Data Editor (for processor inserts).

Workflow:
- Commit code changes to `main` (or merge PR). Cloud Build triggers build & push container images and deploy to the existing services (`process` and `chromeextention`).
- No manual docker build or `gcloud run deploy` needed unless doing emergency hotfix without git (avoid).

Verifying deployment:
1. Cloud Build → History: confirm build succeeded.
2. Cloud Run → Service → Revisions: new revision timestamp matches commit.
3. Logs show `[boot] Starting processor service code.` for processor and `Ingest listening on 8080` for ingest.

If deployment did not happen:
- Check that changed files matched the trigger's include filter.
- Confirm the branch matches trigger configuration.
- Inspect build logs for permission errors (often missing IAM roles on the Cloud Build service account).

Rollback:
- In Cloud Run service page, manually pin traffic to previous revision (traffic split) if latest deploy is bad.

Remove verbose diagnostics:
- After stability, you can strip diagnostic logs in `backend/processor/index.js` (`[push]` lines) to reduce log volume and redeploy via commit.

## Telemetry Payload Example
```
{
  "trigger": "manual",
  "timestamp": "2025-01-01T12:00:00.000Z",
  "speed": { "downloadMbps": 45.2, "uploadMbps": 9.1, "pingMs": 34.5 },
  "reachability": { "results": [ {"url":"https://classroom.google.com","ok":true,"status":200,"latencyMs":120.5} ] },
  "device": { "userAgent": "...", "network": {"effectiveType":"4g","downlinkMbps":10,"rttMs":50} },
  "version": "0.1.0"
}
```

## Notes & Limitations
- Fetch-based speed tests are approximate; production systems may use parallel chunk transfers, multiple sizes, and better warmups.
- Upload test limited to a single POST; adjust `uploadSizeBytes` if needed.
- Some sites may block HEAD; could fallback to GET with `no-store` if needed.
- Geolocation requires permission; if denied, error stored in payload.
- Consider privacy & policy requirements for production deployments.

## Future TODOs
- Options page for dynamic configuration / managed storage
- Offline queue & retry logic
- Enhanced error logging & analytics
- Multiple download sizes / adaptive speed test
- Parallel site reachability for speed (with concurrency limit)
- Authentication / signed requests
- Local result history & UI display
- Use chrome.enterprise APIs if available (managed devices)

## Backend (GCP) Reference Setup

This extension can post telemetry to a lightweight ingest API running on **Google Cloud Run**, which then publishes to **Pub/Sub**, archives raw JSON to **Cloud Storage**, and loads structured data into **BigQuery** for analytics.

### Architecture Summary
Extension -> Cloud Run (POST /telemetry) -> Pub/Sub topic -> Processor (Cloud Function or Cloud Run) ->
1) GCS bucket (raw JSON)  2) BigQuery raw table -> Scheduled queries -> Aggregated tables / dashboards

### Minimal Ingest Service (Node + Express)
Source now resides under `backend/ingest/` for clarity (processor under `backend/processor/`).
```js
import express from 'express';
import {PubSub} from '@google-cloud/pubsub';
import crypto from 'crypto';

const app = express();
app.use(express.json({ limit: '256kb' }));
const pubsub = new PubSub();
const TOPIC = process.env.TOPIC || 'telemetry-raw';
const API_KEY = process.env.API_KEY; // match CONFIG.apiKey in the extension

app.post('/telemetry', async (req, res) => {
  if (!API_KEY || req.get('x-api-key') !== API_KEY) return res.status(401).json({ error: 'unauthorized' });
  const body = req.body;
  if (!body || !body.timestamp) return res.status(400).json({ error: 'invalid payload' });
  const wrapper = { ...body, _ingest: { receivedAt: new Date().toISOString(), requestId: crypto.randomUUID() } };
  try {
    await pubsub.topic(TOPIC).publishMessage({ json: wrapper });
    res.status(202).json({ id: wrapper._ingest.requestId });
  } catch (e) {
    res.status(500).json({ error: 'publish_failed', detail: e.message });
  }
});
app.get('/healthz', (_req, res) => res.send('ok'));
app.listen(process.env.PORT || 8080);
```

`package.json` dependencies:
```json
{ "type": "module", "dependencies": { "express": "^4.19.0", "@google-cloud/pubsub": "^7.7.0" } }
```

### Processor (Pub/Sub -> GCS + BigQuery) Example
```js
import {BigQuery} from '@google-cloud/bigquery';
import {Storage} from '@google-cloud/storage';
const bq = new BigQuery();
const storage = new Storage();
const DATASET = process.env.DATASET || 'telemetry';
const RAW_TABLE = process.env.RAW_TABLE || 'raw';
const BUCKET = process.env.BUCKET;
export async function processMessage(event) {
  const data = JSON.parse(Buffer.from(event.data, 'base64').toString());
  const datePart = (data._ingest?.receivedAt || new Date().toISOString()).slice(0,10);
  await storage.bucket(BUCKET).file(`raw/date=${datePart}/${data._ingest.requestId}.json`).save(JSON.stringify(data));
  await bq.dataset(DATASET).table(RAW_TABLE).insert([{
    trigger: data.trigger,
    timestamp: data.timestamp,
    durationMs: data.durationMs,
    version: data.version,
    speed: data.speed || null,
    reachability: data.reachability || null,
    device: data.device ? JSON.stringify(data.device) : null,
    ingestReceivedAt: data._ingest.receivedAt,
    ingestSourceIp: null,
    requestId: data._ingest.requestId
  }]);
}
```

### BigQuery Raw Table Schema Example
```
trigger:STRING
timestamp:TIMESTAMP
durationMs:INT64
version:STRING
speed:STRUCT<downloadMbps:FLOAT64,uploadMbps:FLOAT64,pingMs:FLOAT64,downloadBytes:INT64,uploadBytes:INT64>
reachability:STRUCT<results:ARRAY<STRUCT<url:STRING,ok:BOOL,status:INT64,latencyMs:FLOAT64,error:STRING>>>
device:JSON
ingestReceivedAt:TIMESTAMP
ingestSourceIp:STRING
requestId:STRING
```

### gcloud Setup Outline (adjust PROJECT_ID & REGION)
```bash
PROJECT_ID=your-project
REGION=us-central1
gcloud config set project $PROJECT_ID
gcloud services enable run.googleapis.com pubsub.googleapis.com bigquery.googleapis.com storage.googleapis.com cloudfunctions.googleapis.com
gcloud pubsub topics create telemetry-raw
gsutil mb -l $REGION gs://$PROJECT_ID-telemetry-raw
bq --location=US mk -d telemetry
bq mk --table telemetry.raw \
  trigger:STRING,timestamp:TIMESTAMP,durationMs:INT64,version:STRING,\
  speed:STRUCT<downloadMbps:FLOAT64,uploadMbps:FLOAT64,pingMs:FLOAT64,downloadBytes:INT64,uploadBytes:INT64>,\
  reachability:STRUCT<results:ARRAY<STRUCT<url:STRING,ok:BOOL,status:INT64,latencyMs:FLOAT64,error:STRING>>>,\
  device:JSON,ingestReceivedAt:TIMESTAMP,ingestSourceIp:STRING,requestId:STRING
```

Deploy Cloud Run ingest (after building image) set `API_KEY` and update `CONFIG.apiKey` in the extension. A Cloud Function (Gen2) with the processor code subscribes to the topic and populates storage + BigQuery.

### Cloud Run GitHub Integration (Continuous Deployment)
1. Push this repository (with `backend/` folder) to GitHub.
2. In Google Cloud Console: Cloud Run > Create Service > Deploy one revision from source.
3. Select "Continuously deploy from a source repository" and connect your GitHub account.
4. Choose the repo & branch (`main`). Set buildpack or Docker (Dockerfile in `backend/`). If using Dockerfile, set source to `backend/`.
5. Set service name (e.g., `telemetry-ingest`). Region: choose close to users or analytics (e.g., `us-central1`).
6. Configure environment variables: `TOPIC=telemetry-raw`, `API_KEY=<your-secret>`.
7. Set ingress: "Allow all" (or restrict + add auth later). Enable minimum instances = 0 for cost savings.
8. After first deploy, copy the service URL and update `config.js` `reportingEndpoint` and `apiKey`.
9. Each push to `main` rebuilds and redeploys automatically.

Optional hardening:
- Use Cloud Build trigger with substitution for version tags.
- Restrict ingress to internal + authorized networks; front with HTTPS Load Balancer + Cloud Armor if needed.
- Add Secret Manager for API_KEY instead of plain env var.

### Local Development (.env)
The `backend/.env` file (excluded from production secrets) can define:
```
API_KEY=CHANGEME_LOCAL_DEV
TOPIC=telemetry-raw
```
`dotenv` loads these when `NODE_ENV` !== production. For Cloud Run deploy, set vars in the service configuration (do not ship real secrets in Git).

### Extension Wiring
Set `CONFIG.reportingEndpoint` to the Cloud Run URL and `CONFIG.apiKey` to the same secret used by the ingest service. The reporter adds the `X-Api-Key` header automatically.

### Future Enhancements
- Add HMAC signature header for tamper detection.
- Scheduled BigQuery queries for daily summaries.
- Looker Studio dashboard on aggregated tables.
- Managed configuration endpoint to push updated site list.

## After Deploying Ingest: What Next?

1. Confirm Ingest Working:
  - Run the extension test; in Cloud Logging filter for service `telemetry-ingest` and status 202.
2. Deploy Processor Service (Cloud Run push subscriber):
  - Build & push image in `backend/processor/` (or set up GitHub deploy like ingest).
  - Create a Pub/Sub push subscription targeting `https://<processor-service-url>/push`.
  - Example CLI:
```bash
SUB=telemetry-raw-processor
PROC_URL=https://YOUR_PROCESSOR_URL/push
gcloud pubsub subscriptions create $SUB \
  --topic=telemetry-raw \
  --push-endpoint=$PROC_URL \
  --push-auth-service-account=YOUR_PROCESSOR_SA@PROJECT_ID.iam.gserviceaccount.com
```
  - Set processor service env vars: `BUCKET`, `DATASET=telemetry`, `RAW_TABLE=raw`.
3. Verify Storage & BigQuery:
  - Check GCS bucket for `raw/date=YYYY-MM-DD/*.json`.
  - Query `telemetry.raw` for recent rows.
4. Schedule Aggregations:
  - Create BigQuery scheduled query for daily summaries.
5. Dashboard:
  - Use Looker Studio connecting to BigQuery dataset for charts (avg download, reachability success, etc.).
6. Security Hardening:
  - Restrict ingress or add Cloud Armor.
  - Move API_KEY to Secret Manager secret reference.
  - Add basic schema validation (reject oversized or malformed data).
7. (Optional) Cost Controls:
  - Set BigQuery table partition on `timestamp`.
  - Add table expiration if you don't need long-term raw.

Troubleshooting Tips:
- 401 responses: API key mismatch.
- 500 publish_failed: Check Pub/Sub topic exists and service account has `pubsub.publisher` role.
- No processor inserts: Verify subscription created and push auth service account has correct IAM: `roles/run.invoker` on processor service and BigQuery/Storage access.

### Cloud Build CI/CD (Optional)
Use provided build configs:
- `cloudbuild-ingest.yaml` builds/deploys `backend/` ingest service (excludes processor code by setting dir to backend).
- `cloudbuild-processor.yaml` builds/deploys `backend/processor/` service.

Set up two triggers:
1. Ingest Trigger:
  - Source: GitHub repo main branch.
  - Include path filter: `backend/**`
  - Exclude path filter: `backend/processor/**`
  - Build config: `cloudbuild-ingest.yaml`.
  - Secret Manager secret `telemetry-api-key` available (for API_KEY).
2. Processor Trigger:
  - Include path filter: `backend/processor/**`
  - Build config: `cloudbuild-processor.yaml`.
  - Secret Manager secret `telemetry-bucket` containing bucket name.

If builds fail with `Dockerfile: no such file`, ensure the `dir:` in the build step points to the folder containing the intended Dockerfile.

Lockfile Note:
Current Dockerfiles use `npm install --omit=dev` because no `package-lock.json` is committed. For reproducible builds, generate and commit a lockfile locally (`npm install`), then change Dockerfiles back to `npm ci`.

## License
Internal / Proprietary (adjust as needed).
