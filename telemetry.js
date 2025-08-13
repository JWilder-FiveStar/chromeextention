// telemetry.js
// Collects device, browser, network, IP, and geolocation (if permitted) telemetry.

export async function collectTelemetry() {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const connection = nav && (nav.connection || nav.mozConnection || nav.webkitConnection);
  const ua = nav.userAgent || '';
  const language = nav.language || 'en-US';
  const platform = nav.platform || 'unknown';
  const languages = nav.languages || [language];

  // Extract device info from user agent
  const deviceInfo = extractDeviceInfo(ua);

  const base = {
    collectedAt: new Date().toISOString(),
    userAgent: ua,
    language,
    languages,
    platform,
    vendor: nav.vendor || null,
    hardwareConcurrency: nav.hardwareConcurrency || null,
    deviceMemory: nav.deviceMemory || null,
    cookieEnabled: nav.cookieEnabled || null,
    onLine: nav.onLine || null,
    // Device identification
    device: {
      make: deviceInfo.make,
      model: deviceInfo.model,
      type: deviceInfo.type, // desktop, mobile, tablet, chromebook
      os: deviceInfo.os,
      osVersion: deviceInfo.osVersion,
      browser: deviceInfo.browser,
      browserVersion: deviceInfo.browserVersion,
      isChromebook: ua.toLowerCase().includes('cros'),
      isMobile: /Mobi|Android/i.test(ua),
      isTablet: /Tablet|iPad/i.test(ua)
    },
    // Screen information
    // Screen information (guard for service worker where screen/window undefined)
    screen: (typeof screen !== 'undefined') ? {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth,
      devicePixelRatio: (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1
    } : null,
    // Window/viewport information (may be null in service worker)
    viewport: (typeof window !== 'undefined') ? {
      width: window.innerWidth,
      height: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight
    } : null,
    // Timezone
    timezone: (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC'
  };

  // Attempt to collect signed-in user (managed accounts) and hardware platform (Chromebook specifics)
  try {
    if (typeof chrome !== 'undefined' && chrome.identity && chrome.identity.getProfileUserInfo) {
      await new Promise(resolve => {
        chrome.identity.getProfileUserInfo(info => {
          base.user = { email: info.email || null, id: info.id || null };
          resolve();
        });
      });
    }
  } catch (e) { base.userError = e.message; }

  try {
    if (typeof chrome !== 'undefined' && chrome.enterprise && chrome.enterprise.hardwarePlatform && chrome.enterprise.hardwarePlatform.getHardwarePlatformInfo) {
      await new Promise(resolve => {
        chrome.enterprise.hardwarePlatform.getHardwarePlatformInfo(h => {
          base.hardware = h; // {model, serialNumber? (policy dependent)}
          resolve();
        });
      });
    }
  } catch (e) { base.hardwareError = e.message; }

  try {
    if (typeof chrome !== 'undefined' && chrome.enterprise && chrome.enterprise.deviceAttributes && chrome.enterprise.deviceAttributes.getDirectoryDeviceId) {
      await new Promise(resolve => {
        chrome.enterprise.deviceAttributes.getDirectoryDeviceId(id => { base.directoryDeviceId = id || null; resolve(); });
      });
    }
  } catch (e) { base.deviceAttrError = e.message; }

  if (connection) {
    base.network = {
      effectiveType: connection.effectiveType,
      downlinkMbps: connection.downlink,
      rttMs: connection.rtt,
      saveData: connection.saveData
    };
  }

  // Public IP and ISP information
  try {
    const resp = await fetch('https://api.ipify.org?format=json');
    const data = await resp.json();
    base.publicIp = data.ip;
    
    // Get ISP information (using a free service)
    try {
      const ispResp = await fetch(`https://ipapi.co/${data.ip}/json/`);
      const ispData = await ispResp.json();
      base.isp = {
        provider: ispData.org || ispData.asn_org,
        city: ispData.city,
        region: ispData.region,
        country: ispData.country_name,
        countryCode: ispData.country_code,
        postalCode: ispData.postal,
        latitude: ispData.latitude,
        longitude: ispData.longitude,
        asn: ispData.asn
      };
    } catch (ispError) {
      base.ispError = ispError.message;
    }
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

// Extract device information from user agent string
function extractDeviceInfo(userAgent) {
  const ua = userAgent.toLowerCase();
  
  // Device make/model detection
  let make = 'Unknown', model = 'Unknown', type = 'desktop';
  
  // Chromebook detection
  if (ua.includes('cros')) {
    type = 'chromebook';
    make = 'Google';
    model = 'Chromebook';
  }
  // Apple devices
  else if (ua.includes('ipad')) {
    type = 'tablet';
    make = 'Apple';
    model = 'iPad';
  }
  else if (ua.includes('iphone')) {
    type = 'mobile';
    make = 'Apple';
    model = 'iPhone';
  }
  else if (ua.includes('mac')) {
    type = 'desktop';
    make = 'Apple';
    model = 'Mac';
  }
  // Windows devices
  else if (ua.includes('windows')) {
    type = 'desktop';
    make = 'PC';
    model = 'Windows';
  }
  // Android devices
  else if (ua.includes('android')) {
    type = ua.includes('tablet') ? 'tablet' : 'mobile';
    make = 'Android';
    model = 'Android Device';
  }
  // Linux
  else if (ua.includes('linux')) {
    type = 'desktop';
    make = 'PC';
    model = 'Linux';
  }

  // OS detection
  let os = 'Unknown', osVersion = 'Unknown';
  if (ua.includes('cros')) {
    os = 'Chrome OS';
  } else if (ua.includes('windows nt')) {
    os = 'Windows';
    const winMatch = ua.match(/windows nt ([\d.]+)/);
    if (winMatch) osVersion = winMatch[1];
  } else if (ua.includes('mac os x')) {
    os = 'macOS';
    const macMatch = ua.match(/mac os x ([\d_]+)/);
    if (macMatch) osVersion = macMatch[1].replace(/_/g, '.');
  } else if (ua.includes('android')) {
    os = 'Android';
    const androidMatch = ua.match(/android ([\d.]+)/);
    if (androidMatch) osVersion = androidMatch[1];
  } else if (ua.includes('linux')) {
    os = 'Linux';
  }

  // Browser detection
  let browser = 'Unknown', browserVersion = 'Unknown';
  if (ua.includes('chrome') && !ua.includes('chromium')) {
    browser = 'Chrome';
    const chromeMatch = ua.match(/chrome\/([\d.]+)/);
    if (chromeMatch) browserVersion = chromeMatch[1];
  } else if (ua.includes('firefox')) {
    browser = 'Firefox';
    const firefoxMatch = ua.match(/firefox\/([\d.]+)/);
    if (firefoxMatch) browserVersion = firefoxMatch[1];
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    browser = 'Safari';
    const safariMatch = ua.match(/version\/([\d.]+)/);
    if (safariMatch) browserVersion = safariMatch[1];
  } else if (ua.includes('edge')) {
    browser = 'Edge';
    const edgeMatch = ua.match(/edge\/([\d.]+)/);
    if (edgeMatch) browserVersion = edgeMatch[1];
  }

  return { make, model, type, os, osVersion, browser, browserVersion };
}
