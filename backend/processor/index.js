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
    const row = {
      trigger: data.trigger,
      timestamp: data.timestamp,
      durationMs: data.durationMs,
      version: data.version,
      speed: data.speed || null,
      reachability: data.reachability || null,
      device: data.device ? JSON.stringify(data.device) : null,
      ingestReceivedAt: data._ingest?.receivedAt,
      ingestSourceIp: data._ingest?.sourceIp || null,
      requestId: data._ingest?.requestId || null
    };
    await bq.dataset(DATASET).table(RAW_TABLE).insert([row]);
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
