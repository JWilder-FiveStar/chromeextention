// background.js (service worker)
// Main orchestrator: listens for popup messages, runs tests, schedules periodic reports.

import { CONFIG } from './config.js';
import { runSpeedTest } from './speedTest.js';
import { checkReachability } from './reachability.js';
import { collectTelemetry } from './telemetry.js';
import { postReport } from './reporter.js';

// Schedule periodic reporting using alarms
chrome.runtime.onInstalled.addListener(() => {
  scheduleReporting();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'autoReport') {
    await runAndReport('auto');
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'RUN_TESTS') {
    runAndReport('manual').then((res) => sendResponse({ ok: true, result: res })).catch(err => {
      sendResponse({ ok: false, error: err?.message || String(err) });
    });
    return true; // async
  }
});

function scheduleReporting() {
  chrome.alarms.clear('autoReport', () => {
    chrome.alarms.create('autoReport', { periodInMinutes: CONFIG.autoReportIntervalMinutes });
  });
}

async function runAndReport(trigger) {
  const started = Date.now();
  const [speed, reachability, baseTelemetry] = await Promise.all([
    runSpeedTest(CONFIG.speedTest).catch(e => ({ error: e.message })),
    checkReachability(CONFIG.reachabilityUrls, CONFIG.reachabilityTimeoutMs),
    collectTelemetry().catch(e => ({ error: e.message }))
  ]);

  // Normalize speed object so missing metrics become 0 (easier downstream visibility)
  if (speed) {
    if (typeof speed.downloadMbps !== 'number') speed.downloadMbps = 0;
    if (typeof speed.uploadMbps !== 'number') speed.uploadMbps = 0;
    if (typeof speed.pingMs !== 'number') speed.pingMs = 0;
  }

  // If identity info missing inside baseTelemetry.user attempt secondary fetch here
  try {
    if (typeof chrome !== 'undefined' && chrome.identity && (!baseTelemetry.user || !baseTelemetry.user.email)) {
      await new Promise(resolve => {
        chrome.identity.getProfileUserInfo(info => {
          baseTelemetry.user = { email: info.email || null, id: info.id || null };
          resolve();
        });
      });
    }
  } catch (e) {
    baseTelemetry.userSecondaryError = e.message;
  }

  const payload = {
    trigger,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - started,
    speed,
    reachability,
    device: baseTelemetry,
    version: chrome.runtime.getManifest().version,
    // TODO: future: add local result cache for offline sending
  };

  const reportResult = await postReport(CONFIG.reportingEndpoint, payload).catch(e => ({ error: e.message }));
  return { payload, reportResult };
}

// TODO: future: add listener for managed config updates
