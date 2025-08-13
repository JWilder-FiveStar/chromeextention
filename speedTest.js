// speedTest.js
// Performs simple download, upload, and latency tests.

export async function runSpeedTest(cfg) {
  const results = { started: new Date().toISOString() };

  // Helper: safe fetch with timeout
  async function timedFetch(url, opts = {}, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(url, { ...opts, signal: ctrl.signal });
    } finally { clearTimeout(t); }
  }

  // Latency (ping) try HEAD then fallback to GET small fetch
  try {
    const pingStart = performance.now();
    try {
      await timedFetch(cfg.downloadUrl, { method: 'HEAD', cache: 'no-store' }, 5000);
    } catch (headErr) {
      // fallback small GET
      await timedFetch(cfg.downloadUrl + '?ping=1&n=' + Math.random(), { cache: 'no-store' }, 5000);
    }
    results.pingMs = +(performance.now() - pingStart).toFixed(2);
  } catch (e) {
    results.pingError = e.message;
  }

  // Download test (attempt primary, fallback to smaller file if error)
  async function doDownload(url) {
    const dlStart = performance.now();
    const resp = await timedFetch(url + '?cacheBust=' + Math.random(), { cache: 'no-store' }, 15000);
    const blob = await resp.blob();
    const dlDuration = (performance.now() - dlStart) / 1000; // seconds
    const bits = blob.size * 8;
    results.downloadMbps = +((bits / dlDuration) / 1_000_000).toFixed(2);
    results.downloadBytes = blob.size;
    results.downloadSeconds = +dlDuration.toFixed(2);
  }
  try {
    await doDownload(cfg.downloadUrl);
  } catch (e) {
    results.downloadError = e.message;
    // fallback smaller test asset if available
    try {
      await doDownload(cfg.fallbackDownloadUrl || 'https://speed.hetzner.de/1MB.bin');
      results.downloadFallbackUsed = true;
    } catch (e2) {
      results.downloadErrorFallback = e2.message;
      // Parallel tiny downloads fallback
      try {
        const parallel = cfg.fallbackParallelRequests || 4;
        const smallUrl = (cfg.fallbackDownloadUrl || 'https://speed.hetzner.de/1MB.bin');
        const start = performance.now();
        const fetches = Array.from({ length: parallel }, () => timedFetch(smallUrl + '?p=' + Math.random(), { cache: 'no-store' }, 10000));
        const resps = await Promise.all(fetches);
        let totalBytes = 0;
        for (const r of resps) totalBytes += (await r.blob()).size;
        const secs = (performance.now() - start)/1000;
        const bits = totalBytes * 8;
        results.downloadMbps = +((bits / secs)/1_000_000).toFixed(2);
        results.downloadBytes = totalBytes;
        results.downloadSeconds = +secs.toFixed(2);
        results.downloadParallelFallbackUsed = true;
      } catch (e3) {
        results.downloadParallelFallbackError = e3.message;
      }
    }
  }

  // Upload test (chunked random bytes to avoid 65536 limit) – skip if uploadEndpoint missing
  function makeRandomBlob(totalBytes) {
    const MAX_CHUNK = 65536; // per getRandomValues call spec
    const parts = [];
    let remaining = totalBytes;
    while (remaining > 0) {
      const size = Math.min(MAX_CHUNK, remaining);
      const arr = new Uint8Array(size);
      crypto.getRandomValues(arr);
      parts.push(arr);
      remaining -= size;
    }
    return new Blob(parts, { type: 'application/octet-stream' });
  }
  try {
    if (cfg.uploadEndpoint) {
      const payload = makeRandomBlob(cfg.uploadSizeBytes || 128 * 1024);
      const upStart = performance.now();
      const resp = await timedFetch(cfg.uploadEndpoint + '?cacheBust=' + Math.random(), {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/octet-stream' }
      }, 20000);
      await resp.text();
      const upDuration = (performance.now() - upStart) / 1000;
      const bits = (cfg.uploadSizeBytes || payload.size) * 8;
      results.uploadMbps = +((bits / upDuration) / 1_000_000).toFixed(2);
      results.uploadBytes = payload.size;
      results.uploadSeconds = +upDuration.toFixed(2);
    }
  } catch (e) {
    results.uploadError = e.message;
    // Provide explicit zeros if failed so UI not blank
    if (typeof results.uploadMbps !== 'number') results.uploadMbps = 0;
  }

  // Ensure numeric fields exist even on error
  if (typeof results.downloadMbps !== 'number') results.downloadMbps = 0;
  if (typeof results.uploadMbps !== 'number') results.uploadMbps = 0;
  if (typeof results.pingMs !== 'number') results.pingMs = 0;

  results.completed = new Date().toISOString();
  return results;
}
