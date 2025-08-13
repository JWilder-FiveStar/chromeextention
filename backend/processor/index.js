// Cloud Run (Pub/Sub push) processor
// Expects Pub/Sub push with JSON body containing message.data (base64)
import express from 'express';
import { BigQuery } from '@google-cloud/bigquery';
import { Storage } from '@google-cloud/storage';

const app = express();
app.use(express.json({ limit: '512kb' }));
console.log('[boot] Starting processor service code. Expect to see this in correct deployment.');

const bq = new BigQuery();
const storage = new Storage();

const DATASET = process.env.DATASET || 'telemetry';
// IMPORTANT: Existing table name in BigQuery is 'pubsub_raw'
const RAW_TABLE = process.env.RAW_TABLE || 'pubsub_raw';
// Desired flattened columns to guarantee in table
const FLAT_SCHEMA_FIELDS = [
  { name: 'download_mbps', type: 'FLOAT' },
  { name: 'upload_mbps', type: 'FLOAT' },
  { name: 'ping_ms', type: 'FLOAT' },
  { name: 'user_email', type: 'STRING' },
  { name: 'device_os', type: 'STRING' },
  { name: 'device_os_version', type: 'STRING' },
  { name: 'device_type', type: 'STRING' }
];

let schemaEnsured = false;
async function ensureSchema() {
  if (schemaEnsured) return;
  try {
    const datasetRef = bq.dataset(DATASET);
    const tableRef = datasetRef.table(RAW_TABLE);
    let meta;
    try {
      [meta] = await tableRef.getMetadata();
    } catch (e) {
      if (e.code === 404) {
        console.log(`Table ${DATASET}.${RAW_TABLE} not found. Creating...`);
        const baseFields = [
          { name: 'trigger', type: 'STRING' },
          { name: 'timestamp', type: 'TIMESTAMP' },
          { name: 'durationMs', type: 'INT64' },
          { name: 'version', type: 'STRING' },
          { name: 'speed', type: 'STRING' },
            // stored JSON as STRING
          { name: 'reachability', type: 'STRING' },
          { name: 'device', type: 'STRING' },
          { name: 'ingestReceivedAt', type: 'TIMESTAMP' },
          { name: 'ingestSourceIp', type: 'STRING' },
          { name: 'requestId', type: 'STRING' }
        ];
        const fullFields = baseFields.concat(FLAT_SCHEMA_FIELDS);
        await datasetRef.createTable(RAW_TABLE, { schema: fullFields });
        console.log('Created table with schema (base + flattened).');
        [meta] = await tableRef.getMetadata();
      } else throw e;
    }
    const existing = new Set(meta.schema.fields.map(f => f.name));
    const toAdd = FLAT_SCHEMA_FIELDS.filter(f => !existing.has(f.name));
    if (toAdd.length) {
      const newFields = meta.schema.fields.concat(toAdd);
      await tableRef.setMetadata({ schema: { fields: newFields } });
      console.log('BigQuery schema updated: added fields', toAdd.map(f=>f.name).join(','));
    }
    schemaEnsured = true;
  } catch (e) {
    console.warn('ensureSchema failed (will retry later):', e.message);
  }
}

const BUCKET = process.env.BUCKET; // required

function decodeMessage(req) {
  const msg = req.body?.message;
  if (!msg?.data) throw new Error('missing pubsub message data');
  const jsonStr = Buffer.from(msg.data, 'base64').toString();
  return JSON.parse(jsonStr);
}

app.post('/push', async (req, res) => {
  console.log('[push] received request headers:', Object.fromEntries(Object.entries(req.headers).filter(([k]) => ['ce-type','user-agent','content-type'].includes(k))));
  try { console.log('[push] raw body snippet:', JSON.stringify(req.body).slice(0,300)); } catch {}
  try {
  await ensureSchema();
    const data = decodeMessage(req);
    console.log('[push] decoded message keys:', Object.keys(data));
    const datePart = (data._ingest?.receivedAt || new Date().toISOString()).slice(0,10);
    const objectName = `raw/date=${datePart}/${data._ingest?.requestId || Date.now()}.json`;
    if (!BUCKET) throw new Error('BUCKET env var required');
    await storage.bucket(BUCKET).file(objectName).save(JSON.stringify(data));

    // Insert into BigQuery
    // Extract nested fields for flattened columns
    const speed = data.speed || {};
    const device = data.device || {};
    const devInner = device.device || {};
    const baseRow = {
      trigger: data.trigger,
      timestamp: data.timestamp,
      durationMs: data.durationMs,
      version: data.version,
      // Fallback: stringify JSON until table truly supports JSON type end-to-end
      speed: data.speed ? JSON.stringify(data.speed) : null,
      reachability: data.reachability ? JSON.stringify(data.reachability) : null,
      device: data.device ? JSON.stringify(data.device) : null,
      ingestReceivedAt: data._ingest?.receivedAt,
      ingestSourceIp: data._ingest?.sourceIp || null,
      requestId: data._ingest?.requestId || null
    };
    // Always include flattened fields (ensureSchema already attempted)
    const row = {
      ...baseRow,
      download_mbps: typeof speed.downloadMbps === 'number' ? speed.downloadMbps : null,
      upload_mbps: typeof speed.uploadMbps === 'number' ? speed.uploadMbps : null,
      ping_ms: typeof speed.pingMs === 'number' ? speed.pingMs : null,
      user_email: device.user && device.user.email ? device.user.email : null,
      device_os: devInner.os || null,
      device_os_version: devInner.osVersion || null,
      device_type: devInner.type || null
    };
    
    console.log('Attempting BigQuery insert with row:', JSON.stringify(row, null, 2));
    try {
  const tableRef = bq.dataset(DATASET).table(RAW_TABLE);
  await tableRef.insert([row]);
  console.log(`BigQuery insert successful into ${DATASET}.${RAW_TABLE}`);
    } catch (insertError) {
      console.error('BigQuery insert failed summary:', insertError.name || 'Unknown', insertError.message || '');
  console.error('Dataset/Table targeted:', DATASET, RAW_TABLE);
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
