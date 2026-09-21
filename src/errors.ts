/** Map LocAR.js / browser error codes to messages a non-developer can act on. */
import { isIOSLike } from './checks';

export interface AppError {
  code: string;
  message: string;
}

export function describeStartError(e: unknown): string {
  const err = (e ?? {}) as Partial<AppError>;
  const code = err.code ?? '';
  switch (code) {
    // --- camera (getUserMedia DOMException names, forwarded by LocAR) ---
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return isIOSLike()
        ? 'Camera access was denied. Reload the page and tap Allow. If Safari no longer asks, tap the “aA” / page icon in the address bar → Website Settings → Camera.'
        : 'Camera access was denied. Tap the lock icon in the address bar → Permissions → allow Camera, then reload.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera was found on this device.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The camera is in use by another app or could not be started. Close other camera apps and reload.';
    case 'OverconstrainedError':
      return 'No rear-facing camera is available.';
    case 'LOCAR_NO_MEDIA_DEVICES_API':
      return 'Camera API not available in this browser. Open the link in Chrome or Safari, not an in-app browser.';
    // --- device orientation (LocAR codes) ---
    case 'LOCAR_DEVICE_ORIENTATION_NOT_SUPPORTED':
      return 'This device/browser has no orientation sensor API, so the view cannot follow where you point.';
    case 'LOCAR_DEVICE_ORIENTATION_NO_HTTPS':
      return 'Motion sensors are only available over HTTPS. Open the https:// link.';
    case 'LOCAR_DEVICE_ORIENTATION_PERMISSION_DENIED':
      return 'Motion & Orientation access was denied. iOS will not ask again in this tab: close the tab, reopen the link and tap Allow.';
    case 'LOCAR_DEVICE_ORIENTATION_PERMISSION_FAILED':
    case 'LOCAR_DEVICE_ORIENTATION_INTERNAL_ERROR':
      return `Motion sensor permission request failed (${code}). Reload and try again.`;
    default:
      return `Could not start AR: ${err.message ?? String(e)}${code ? ` (${code})` : ''}`;
  }
}

export function describeGpsError(e: GeolocationPositionError): string {
  switch (e.code) {
    case e.PERMISSION_DENIED:
      return 'Location access was denied. Allow Location for this site (lock icon / “aA” in the address bar) and reload. On iOS also check Settings → Privacy & Security → Location Services → Safari Websites.';
    case e.POSITION_UNAVAILABLE:
      return 'Location unavailable. Make sure Location Services are on and you are outdoors. Wi-Fi-only iPads have no GPS and may never get a usable fix.';
    case e.TIMEOUT:
      return 'GPS timed out. Move to open sky away from buildings and trees; the first fix can take 30–60 s.';
    default:
      return `Location error: ${e.message}`;
  }
}
