/**
 * Pre-flight capability checks, run on the landing page BEFORE any permission
 * prompts so the user gets a plain-language reason if this can never work.
 */

export interface CheckResult {
  /** Hard failure: Start AR is disabled. */
  fatal: boolean;
  message: string;
}

export function isIOSLike(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as a Mac; the touch-points test tells them apart.
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function runPreflight(): CheckResult[] {
  const out: CheckResult[] = [];
  const ua = navigator.userAgent;

  if (!window.isSecureContext) {
    out.push({
      fatal: true,
      message:
        'Not a secure context. Camera, GPS and motion sensors only work over HTTPS (or on localhost). Open the https:// link.',
    });
  }
  if (!hasWebGL()) {
    out.push({
      fatal: true,
      message: 'WebGL is unavailable in this browser, so nothing can be drawn. Try Chrome (Android) or Safari (iOS).',
    });
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    out.push({
      fatal: true,
      message:
        'Camera API not available. In-app browsers (Instagram, Facebook, some QR apps) often block it — open in Chrome or Safari.',
    });
  }
  if (!('geolocation' in navigator)) {
    out.push({ fatal: true, message: 'Geolocation API not available in this browser.' });
  }
  if (typeof window.DeviceOrientationEvent === 'undefined') {
    out.push({
      fatal: true,
      message: 'No device orientation API. The view cannot follow where you point the device.',
    });
  }
  if (/Firefox/i.test(ua)) {
    out.push({
      fatal: false,
      message:
        'Firefox does not fully implement the absolute orientation API; north will likely be wrong. Use Chrome or Safari.',
    });
  }
  if (isIOSLike() && !/Safari/i.test(ua) && !/CriOS/i.test(ua)) {
    out.push({
      fatal: false,
      message:
        'This looks like an in-app browser on iOS. Motion sensor permission often fails here — open the link in Safari.',
    });
  }
  return out;
}
