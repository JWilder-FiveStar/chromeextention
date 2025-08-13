// popup.js
// Simple UI to trigger telemetry run.

document.getElementById('runBtn').addEventListener('click', () => {
  setStatus('Running tests...');
  chrome.runtime.sendMessage({ type: 'RUN_TESTS' }, (resp) => {
    if (!resp) {
      setStatus('No response (check background).');
      return;
    }
    if (!resp.ok) {
      setStatus('Error: ' + resp.error);
      return;
    }
    const { payload, reportResult } = resp.result;
    const summary = summarise(payload, reportResult);
    setStatus(summary);
  });
});

function summarise(payload, report) {
  const parts = [];
  if (payload.speed) {
    if (payload.speed.downloadMbps) parts.push(`DL ${payload.speed.downloadMbps}Mbps`);
    if (payload.speed.uploadMbps) parts.push(`UL ${payload.speed.uploadMbps}Mbps`);
    if (payload.speed.pingMs) parts.push(`Ping ${payload.speed.pingMs}ms`);
  }
  if (payload.reachability?.results) {
    const okCount = payload.reachability.results.filter(r => r.ok).length;
    parts.push(`Sites OK: ${okCount}/${payload.reachability.results.length}`);
  }
  if (report?.status) parts.push(`Report ${report.status}${report.ok ? ' OK' : ' FAIL'}`);
  return parts.join('\n');
}

function setStatus(msg) {
  document.getElementById('status').textContent = msg;
}
