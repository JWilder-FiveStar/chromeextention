// Basic configuration for telemetry extension
export const CONFIG = {
  reportingEndpoint: 'https://chromeextention-454431786636.us-east5.run.app/telemetry', // Cloud Run ingest endpoint
  apiKey: '2DiB5JZ6dA4h24lbBgm/BuGS4+VfGL5AgTg0XzMhAME=', // Backend ingest API key (X-Api-Key header)
  autoReportIntervalMinutes: 60, // periodic reporting interval
  reachabilityTimeoutMs: 4000,
  speedTest: {
    downloadUrl: 'https://httpbin.org/bytes/1048576', // 1MB from httpbin (more reliable)
    uploadEndpoint: 'https://httpbin.org/post', // echoes data size
    uploadSizeBytes: 256 * 1024, // 256KB synthetic blob
    fallbackDownloadUrl: 'https://httpbin.org/bytes/524288', // 512KB fallback
    fallbackParallelRequests: 4
  },
  reachabilityUrls: [
    'https://classroom.google.com',
    'https://drive.google.com',
    'https://meet.google.com',
    'https://www.youtube.com',
    'https://teams.microsoft.com',
    'https://www.office.com',
    'https://zoom.us',
    'https://clever.com',
    'https://www.khanacademy.org',
    'https://quizlet.com',
    'https://www.pearson.com',
    'https://www.hmhco.com'
  ],
  // TODO: future: move to managed storage or remote config
};
 
// Optional: attempt to load overrides from a non-committed file `config.local.js`.
// This allows injecting secrets (like apiKey) at build time without hardcoding.
// Note: Top-level await in service workers can cause registration issues, so commenting out for now.
/*
try {
  const mod = await import('./config.local.js');
  if (mod && typeof mod.CONFIG_OVERRIDES === 'object') {
    Object.assign(CONFIG, mod.CONFIG_OVERRIDES);
  }
} catch (_e) {
  // Silently ignore if file not present.
}
*/
