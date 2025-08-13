// reachability.js
// Checks a list of URLs for reachability, status, and latency.

export async function checkReachability(urls, timeoutMs = 4000) {
  const controller = new AbortController();
  const results = [];

  async function check(url) {
    const started = performance.now();
    const entry = { url };
    const to = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      entry.status = resp.status;
      entry.ok = resp.ok;
    } catch (e) {
      entry.error = e.name === 'AbortError' ? 'timeout' : e.message;
      entry.ok = false;
    } finally {
      clearTimeout(to);
      entry.latencyMs = +(performance.now() - started).toFixed(2);
    }
    return entry;
  }

  for (const url of urls) {
    // Independent abort controller per request for isolation
    controller.signal.throwIfAborted?.();
    results.push(await check(url));
  }
  return { started: new Date().toISOString(), results, completed: new Date().toISOString() };
}
