import express from 'express';
import { PubSub } from '@google-cloud/pubsub';
import crypto from 'crypto';
import dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const app = express();
app.use(express.json({ limit: '256kb' }));

const pubsub = new PubSub();
const TOPIC = process.env.TOPIC || 'telemetry-raw';
const API_KEY = process.env.API_KEY; // set in Cloud Run settings

app.post('/telemetry', async (req, res) => {
  if (!API_KEY || req.get('x-api-key') !== API_KEY) return res.status(401).json({ error: 'unauthorized' });
  let body = req.body;
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'invalid json' });
  if (!body.timestamp) return res.status(400).json({ error: 'missing timestamp' });
  const wrapper = {
    ...body,
    _ingest: {
      receivedAt: new Date().toISOString(),
      requestId: crypto.randomUUID(),
    }
  };
  try {
    await pubsub.topic(TOPIC).publishMessage({ json: wrapper });
    res.status(202).json({ id: wrapper._ingest.requestId });
  } catch (e) {
    res.status(500).json({ error: 'publish_failed', detail: e.message });
  }
});

app.get('/healthz', (_req, res) => res.send('ok'));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log('Ingest listening on', port));
