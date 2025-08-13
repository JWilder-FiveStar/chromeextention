// Cloud Run (Pub/Sub push) processor
// Expects Pub/Sub push with JSON body containing message.data (base64)
import express from 'express';
import { BigQuery } from '@google-cloud/bigquery';
import { Storage } from '@google-cloud/storage';

const app = express();
app.use(express.json({ limit: '512kb' }));

const bq = new BigQuery();
const storage = new Storage();

const DATASET = process.env.DATASET || 'telemetry';
const RAW_TABLE = process.env.RAW_TABLE || 'raw';
const BUCKET = process.env.BUCKET; // required

function decodeMessage(req) {
  const msg = req.body?.message;
  if (!msg?.data) throw new Error('missing pubsub message data');
  const jsonStr = Buffer.from(msg.data, 'base64').toString();
  return JSON.parse(jsonStr);
}

app.post('/push', async (req, res) => {
  try {
    const data = decodeMessage(req);
    const datePart = (data._ingest?.receivedAt || new Date().toISOString()).slice(0,10);
    const objectName = `raw/date=${datePart}/${data._ingest?.requestId || Date.now()}.json`;
    if (!BUCKET) throw new Error('BUCKET env var required');
    await storage.bucket(BUCKET).file(objectName).save(JSON.stringify(data));

    // Insert into BigQuery
    // Extract nested fields for flattened columns
    const speed = data.speed || {};
    const reach = data.reachability || {};
    const device = data.device || {};
    const devInner = device.device || {};
    const row = {
      trigger: data.trigger,
      timestamp: data.timestamp,
      durationMs: data.durationMs,
      version: data.version,
      // Fallback: stringify JSON until table truly supports JSON type end-to-end
      speed: data.speed ? JSON.stringify(data.speed) : null,
      reachability: data.reachability ? JSON.stringify(data.reachability) : null,
      device: data.device ? JSON.stringify(data.device) : null,
      // Flattened fields for easier querying (add columns via ALTER TABLE beforehand)
      download_mbps: typeof speed.downloadMbps === 'number' ? speed.downloadMbps : null,
      upload_mbps: typeof speed.uploadMbps === 'number' ? speed.uploadMbps : null,
      ping_ms: typeof speed.pingMs === 'number' ? speed.pingMs : null,
      user_email: device.user && device.user.email ? device.user.email : null,
      device_os: devInner.os || null,
      device_os_version: devInner.osVersion || null,
      device_type: devInner.type || null,
      ingestReceivedAt: data._ingest?.receivedAt,
      ingestSourceIp: data._ingest?.sourceIp || null,
      requestId: data._ingest?.requestId || null
    };
    
    console.log('Attempting BigQuery insert with row:', JSON.stringify(row, null, 2));
    try {
      await bq.dataset(DATASET).table(RAW_TABLE).insert([row]);
      console.log('BigQuery insert successful');
    } catch (insertError) {
      console.error('BigQuery insert failed summary:', insertError.name || 'Unknown', insertError.message || '');
      if (insertError.errors && Array.isArray(insertError.errors)) {
        insertError.errors.forEach((errGroup, idx) => {
          console.error(` BigQuery errGroup[${idx}] raw:`, JSON.stringify(errGroup));
          if (errGroup.errors) {
            errGroup.errors.forEach((e, jdx) => {
              console.error(`  -> reason=${e.reason} location=${e.location || ''} message=${e.message}`);
            });
          }
        });
      }
      if (insertError.response) {
        try {
          console.error(' BigQuery response snippet:', JSON.stringify(insertError.response).slice(0, 500));
        } catch {}
      }
      console.error(' Row attempted:', JSON.stringify(row));
      throw insertError;
    }
    res.status(204).end();
  } catch (e) {
    console.error('Processor error', e);
    // Return 200 so Pub/Sub does not retry forever on poison messages after logging.
    res.status(200).json({ error: e.message });
  }
});

app.get('/healthz', (_req, res) => res.send('ok'));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log('Processor listening on', port));
