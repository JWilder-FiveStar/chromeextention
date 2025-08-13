// reporter.js
// Posts collected payload to configured endpoint.

import { CONFIG } from './config.js';

export async function postReport(endpoint, payload) {
  const started = performance.now();
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (CONFIG.apiKey) headers['X-Api-Key'] = CONFIG.apiKey; // optional auth header
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    const text = await resp.text().catch(() => '');
    return {
      status: resp.status,
      ok: resp.ok,
      durationMs: +(performance.now() - started).toFixed(2),
      responsePreview: text.slice(0, 500)
    };
  } catch (e) {
    return { error: e.message, durationMs: +(performance.now() - started).toFixed(2) };
  }
}
