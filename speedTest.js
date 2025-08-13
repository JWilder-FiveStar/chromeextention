// speedTest.js
// Performs simple download, upload, and latency tests.

export async function runSpeedTest(cfg) {
  const results = { started: new Date().toISOString() };
  // Latency (ping) via HEAD or small fetch
  try {
    const pingStart = performance.now();
    await fetch(cfg.downloadUrl, { method: 'HEAD', cache: 'no-store' });
    results.pingMs = +(performance.now() - pingStart).toFixed(2);
  } catch (e) {
    results.pingError = e.message;
  }

  // Download test
  try {
    const dlStart = performance.now();
    const resp = await fetch(cfg.downloadUrl + '?cacheBust=' + Math.random(), { cache: 'no-store' });
    const blob = await resp.blob();
    const dlDuration = (performance.now() - dlStart) / 1000; // seconds
    const bits = blob.size * 8;
    results.downloadMbps = +((bits / dlDuration) / 1_000_000).toFixed(2);
    results.downloadBytes = blob.size;
    results.downloadSeconds = +dlDuration.toFixed(2);
  } catch (e) {
    results.downloadError = e.message;
  }

  // Upload test (synthetic blob)
  try {
    const payload = new Blob([crypto.getRandomValues(new Uint8Array(cfg.uploadSizeBytes))]);
    const upStart = performance.now();
    const resp = await fetch(cfg.uploadEndpoint + '?cacheBust=' + Math.random(), {
      method: 'POST',
      body: payload,
      headers: { 'Content-Type': 'application/octet-stream' }
    });
    await resp.text(); // ensure completion
    const upDuration = (performance.now() - upStart) / 1000;
    const bits = cfg.uploadSizeBytes * 8;
    results.uploadMbps = +((bits / upDuration) / 1_000_000).toFixed(2);
    results.uploadBytes = cfg.uploadSizeBytes;
    results.uploadSeconds = +upDuration.toFixed(2);
  } catch (e) {
    results.uploadError = e.message;
  }

  results.completed = new Date().toISOString();
  return results;
}
