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
const TOPIC = process.env.TOPIC || 'telemetry-data';
const API_KEY = process.env.API_KEY || 'P/aOCbkc0WPzrldkfqkoeyTKz0nabNFtQB6+Eb20sG0='; // fallback for development

app.post('/telemetry', async (req, res) => {
  const receivedKey = req.get('x-api-key');
  console.log('API Key check:', { 
    hasAPIKey: !!API_KEY, 
    receivedKey: receivedKey ? `${receivedKey.slice(0,8)}...` : 'none',
    expectedKey: API_KEY ? `${API_KEY.slice(0,8)}...` : 'none'
  });
  
  if (!API_KEY || receivedKey !== API_KEY) {
    console.log('Unauthorized request');
    return res.status(401).json({ error: 'unauthorized' });
  }
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

app.get('/debug', (_req, res) => {
  res.json({
    topic: TOPIC,
    hasApiKey: !!API_KEY,
    apiKeyPrefix: API_KEY ? API_KEY.slice(0, 8) + '...' : 'none',
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log('Ingest listening on', port));
