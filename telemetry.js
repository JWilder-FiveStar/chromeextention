// telemetry.js
// Collects device, browser, network, IP, and geolocation (if permitted) telemetry.

export async function collectTelemetry() {
  const nav = navigator;
  const connection = nav.connection || nav.mozConnection || nav.webkitConnection;
  const ua = nav.userAgent;
  const language = nav.language;
  const platform = nav.platform;
  const languages = nav.languages;

  const base = {
    collectedAt: new Date().toISOString(),
    userAgent: ua,
    language,
    languages,
    platform,
    vendor: nav.vendor,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
  };

  if (connection) {
    base.network = {
      effectiveType: connection.effectiveType,
      downlinkMbps: connection.downlink,
      rttMs: connection.rtt,
      saveData: connection.saveData
    };
  }

  // Public IP
  try {
    const resp = await fetch('https://api.ipify.org?format=json');
    const data = await resp.json();
    base.publicIp = data.ip;
  } catch (e) {
    base.publicIpError = e.message;
  }

  // Geolocation (may require permission; ignore failure)
  base.geo = await new Promise(resolve => {
    if (!('geolocation' in navigator)) return resolve({ supported: false });
    const id = navigator.geolocation.getCurrentPosition(pos => {
      resolve({
        supported: true,
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracyM: pos.coords.accuracy,
        timestamp: pos.timestamp
      });
    }, err => {
      resolve({ supported: true, error: err.message, code: err.code });
    }, { maximumAge: 60000, timeout: 5000, enableHighAccuracy: false });
  });

  return base;
}
