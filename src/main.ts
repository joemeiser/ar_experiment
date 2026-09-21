/**
 * Entry point. Flow:
 *   landing -> Start AR tap -> (iOS) orientation permission -> LocAR.App (camera)
 *   -> GPS -> first accepted fix -> one object added per configured site -> render loop.
 *
 * Verified against locar 0.2.12 (dist/locar.d.ts + source):
 *   - new App({...}) constructs Webcam immediately (getUserMedia prompt fires here).
 *   - app.start() resolves with a LocAR instance once orientation is granted; it does
 *     NOT start the GPS — call locar.startGps().
 *   - locar.add(object, lon, lat, elev)  <-- LONGITUDE FIRST.
 *   - locar.fakeGps(lon, lat, elev, acc) <-- LONGITUDE FIRST.
 *   - Camera stays at y = 0; elev is written directly to object.position.y.
 *   - Fixes with accuracy > gpsMinAccuracy are dropped silently (no gpsupdate).
 *   - world x = easting, world z = -northing (north is -z).
 *   - Default projection is Web Mercator, which is NOT metres away from the
 *     equator (×1.325 at 41°N). We pass LocalMetricProjection instead.
 */
import './style.css';
import * as THREE from 'three';
import { App, type GpsReceivedEvent, type LocAR } from 'locar';
import { config, resolvedSites, type ResolvedSite } from './config';
import { runPreflight, isIOSLike } from './checks';
import { describeStartError, describeGpsError } from './errors';
import { distanceM, bearingDeg, offsetLatLon, LocalMetricProjection, type LatLon } from './geo';
import { anchorHeightM, buildObject, addLights, type BuiltObject } from './sculpture';
import { ui, show, hide, banner, clearBanner, setStatus, setDebug } from './ui';

// ---------------------------------------------------------------------------
// URL flags
// ---------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const SITES = resolvedSites();
// ?debug=1&fake=N -> fake viewer near site N (1-based). Out-of-range N falls back to site 1.
const FAKE_N = Number(params.get('fake'));
const FAKE = DEBUG && Number.isInteger(FAKE_N) && FAKE_N >= 1;
const FAKE_SITE = SITES[FAKE && FAKE_N <= SITES.length ? FAKE_N - 1 : 0];

interface PlacedSite {
  site: ResolvedSite;
  object: BuiltObject;
}

/** Closest site to a position, with its distance. */
function nearestSite(p: LatLon): { site: ResolvedSite; distM: number } {
  let best = { site: SITES[0], distM: distanceM(p, SITES[0]) };
  for (const site of SITES.slice(1)) {
    const d = distanceM(p, site);
    if (d < best.distM) best = { site, distM: d };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Runtime state (read by the debug overlay)
// ---------------------------------------------------------------------------
const state = {
  app: null as App | null,
  locar: null as LocAR | null,
  placed: [] as PlacedSite[],
  placing: false,
  // raw geolocation (our own watcher — sees fixes LocAR rejects)
  lastFix: null as GeolocationPosition | null,
  lastFixAt: 0,
  fixCount: 0,
  // fixes LocAR accepted (moved the camera)
  acceptedCount: 0,
  // raw orientation events
  lastOrient: null as DeviceOrientationEvent | null,
  orientCount: 0,
  orientCountWindow: 0,
  orientRateHz: 0,
  orientEventName: ('ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation') as
    | 'deviceorientationabsolute'
    | 'deviceorientation',
  dragLook: false,
  webcamStarted: false,
};

// ---------------------------------------------------------------------------
// Landing / preflight
// ---------------------------------------------------------------------------
{
  const results = runPreflight();
  ui.preflight.innerHTML = '';
  let fatal = false;
  for (const r of results) {
    const li = document.createElement('li');
    li.className = r.fatal ? 'fatal' : 'warn';
    li.textContent = r.message;
    ui.preflight.appendChild(li);
    fatal ||= r.fatal;
  }
  ui.start.disabled = fatal;
  ui.buildInfo.textContent =
    SITES.map((s) => `${s.name} ${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)}`).join(' · ') +
    (DEBUG ? ` · debug${FAKE ? ` · FAKE GPS near ${FAKE_SITE.name}` : ''}` : '');
  if (DEBUG) show(ui.debug);
}

ui.start.addEventListener('click', () => {
  ui.start.disabled = true;
  ui.start.textContent = 'Starting…';
  void startAR().catch((e: unknown) => {
    banner('error', describeStartError(e));
    ui.start.disabled = false;
    ui.start.textContent = 'Retry';
    show(ui.landing);
  });
});

// ---------------------------------------------------------------------------
// Start sequence
// ---------------------------------------------------------------------------
async function startAR(): Promise<void> {
  // 1. iOS/iPadOS: DeviceOrientationEvent.requestPermission() must be invoked
  //    synchronously inside the user gesture. Do it BEFORE constructing the App,
  //    with LocAR's own permission dialog disabled (it would otherwise demand a
  //    second tap on its own modal).
  const DOE = window.DeviceOrientationEvent as DeviceOrientationEventWithPermission | undefined;
  if (typeof DOE?.requestPermission === 'function' && !FAKE) {
    let result: 'granted' | 'denied';
    try {
      result = await DOE.requestPermission();
    } catch (e) {
      throw { code: 'LOCAR_DEVICE_ORIENTATION_PERMISSION_FAILED', message: String(e) };
    }
    if (result !== 'granted') {
      throw { code: 'LOCAR_DEVICE_ORIENTATION_PERMISSION_DENIED', message: 'denied' };
    }
  }

  // 2. Construct the app. This fires the camera permission prompt.
  const app = new App({
    cameraOptions: { hFov: config.cameraHFovDeg, near: 0.1, far: config.cameraFarM },
    gpsOptions: { gpsMinAccuracy: config.gpsMinAccuracyM, gpsMinDistance: config.gpsMinDistanceM },
    videoConstraints: { video: { facingMode: 'environment' } },
    // True-metre projection instead of LocAR's default Web Mercator (see geo.ts).
    projection: new LocalMetricProjection(SITES[0].latitude),
    deviceOrientationOptions: {
      enabled: true,
      enablePermissionDialog: false, // we handled the iOS gesture above
      smoothingFactor: 0.2,
    },
  });
  state.app = app;
  app.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // start() resolves when orientation is granted, which on most devices happens
  // BEFORE the camera stream is ready — so a camera failure after that point
  // would be lost. Listen on the webcam directly.
  app.webcam.on('webcamerror', (e: { code: string; message: string }) => {
    banner('error', describeStartError(e));
  });
  app.on('webcamstarted', () => {
    state.webcamStarted = true;
  });

  // 3. Camera + orientation.
  const locar = await app.start(); // rejects with {code, message}
  state.locar = locar;

  hide(ui.landing);
  show(ui.status);
  setStatus('GPS: waiting for fix…', 'Target: —', false);

  addLights(app.scene);
  watchOrientationForDebug();

  // 4. GPS.
  locar.on('gpserror', (e: GeolocationPositionError) => {
    banner('error', describeGpsError(e));
  });
  locar.on('gpsupdate', (ev: GpsReceivedEvent) => void onAcceptedFix(ev));

  if (FAKE) {
    const fake = offsetLatLon(FAKE_SITE, -config.fakeViewerOffsetSouthM, 0);
    // synthetic fix also feeds the status bar
    onRawFix({
      coords: { ...fake, accuracy: 5, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}) },
      timestamp: Date.now(),
      toJSON: () => ({}),
    } as GeolocationPosition);
    locar.fakeGps(fake.longitude, fake.latitude, null, 5); // (lon, lat, elev, acc)
    banner('info', `FAKE GPS: you are ${config.fakeViewerOffsetSouthM} m south of ${FAKE_SITE.name}, facing north. Drag to look if this device has no motion sensors.`);
    // Desktop has DeviceOrientationEvent but never fires it. Fall back to drag-look.
    setTimeout(() => {
      if (state.orientCount === 0) enableDragLook(app);
    }, 1500);
  } else {
    startRawGpsWatcher();
    const ok = await locar.startGps();
    if (!ok) banner('warn', 'GPS was already running.');
  }

  if (DEBUG) requestAnimationFrame(debugLoop);
}

// ---------------------------------------------------------------------------
// GPS handling
// ---------------------------------------------------------------------------
let gpsTimeoutTimer: number | undefined;

/**
 * Our own watcher, independent of LocAR's, so the UI can show accuracy for fixes
 * LocAR discards (accuracy > gpsMinAccuracyM) and can detect timeouts.
 * Both watchers share one permission prompt.
 */
function startRawGpsWatcher(): void {
  navigator.geolocation.watchPosition(onRawFix, (e) => {
    if (e.code === e.TIMEOUT) banner('warn', describeGpsError(e));
    else banner('error', describeGpsError(e));
  }, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: config.gpsTimeoutMs,
  });
  gpsTimeoutTimer = window.setTimeout(() => {
    if (state.fixCount === 0) {
      banner('warn', `No GPS fix after ${config.gpsTimeoutMs / 1000} s. Stand in open sky; keep waiting.`);
    }
  }, config.gpsTimeoutMs);
}

function onRawFix(pos: GeolocationPosition): void {
  state.lastFix = pos;
  state.lastFixAt = performance.now();
  state.fixCount++;
  if (gpsTimeoutTimer !== undefined) {
    clearTimeout(gpsTimeoutTimer);
    gpsTimeoutTimer = undefined;
  }
  clearBanner('warn');

  const acc = pos.coords.accuracy;
  const near = nearestSite(pos.coords);
  const poor = acc > config.poorAccuracyThresholdM;
  const rejected = acc > config.gpsMinAccuracyM;

  setStatus(
    `GPS ±${acc.toFixed(0)} m${rejected ? ' (ignored)' : ''}`,
    `${near.site.name} ${near.distM.toFixed(0)} m`,
    poor,
  );

  if (rejected) {
    banner(
      'warn',
      `GPS accuracy is ±${acc.toFixed(0)} m, worse than the ${config.gpsMinAccuracyM} m cutoff — LocAR is ignoring this fix. ` +
        `Wi-Fi-only iPads have no GPS receiver and typically stay here.`,
    );
  } else if (poor) {
    banner(
      'warn',
      `GPS accuracy ±${acc.toFixed(0)} m (want < ${config.poorAccuracyThresholdM} m). Object placement will be off by a similar amount. Move to open sky.`,
    );
  }
}

async function onAcceptedFix(ev: GpsReceivedEvent): Promise<void> {
  state.acceptedCount++;
  const locar = state.locar;
  // Objects are placed once; afterwards LocAR moves the camera itself.
  // `placing` stops a second fix arriving mid-load from placing duplicates.
  if (state.placing || state.placed.length > 0 || !locar) return;
  state.placing = true;

  for (const site of SITES) {
    try {
      const object = await buildObject(site);
      // LONGITUDE, LATITUDE order — verified in locar.d.ts.
      locar.add(object.group, site.longitude, site.latitude, anchorHeightM(site), { site: site.name });
      state.placed.push({ site, object });
    } catch (e) {
      banner('error', `Could not load the object for ${site.name}: ${String(e)}. Check modelUrl in src/config.ts.`);
    }
  }

  const here = ev.position.coords;
  const near = nearestSite(here);
  if (near.distM > 300) {
    banner(
      'info',
      `Objects placed. Nearest is ${near.site.name}, ${near.distM.toFixed(0)} m away, bearing ${bearingDeg(here, near.site).toFixed(0)}°.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Orientation (debug + "no sensor data" detection)
// ---------------------------------------------------------------------------
function watchOrientationForDebug(): void {
  window.addEventListener(state.orientEventName, (e) => {
    state.lastOrient = e;
    // Desktop Chrome fires one event with all-null angles and no sensor behind it.
    if (e.alpha === null && e.beta === null && e.gamma === null) return;
    state.orientCount++;
    state.orientCountWindow++;
  });
  // event rate, once per second
  setInterval(() => {
    state.orientRateHz = state.orientCountWindow;
    state.orientCountWindow = 0;
  }, 1000);
  // If nothing arrives, the device has no usable gyro/compass (or Firefox).
  setTimeout(() => {
    if (state.orientCount === 0 && !FAKE) {
      banner(
        'warn',
        'No orientation sensor data is arriving. The view will not follow the device. On iOS, check Motion & Orientation access; on laptops/desktops this is expected.',
      );
    }
  }, 4000);
}

/** Desktop fallback in fake mode: pointer drag rotates the camera. */
function enableDragLook(app: App): void {
  if (state.dragLook) return;
  state.dragLook = true;
  if (app.deviceOrientationControls) app.deviceOrientationControls.enabled = false;

  // Face north, level. A null orientation event may already have tilted the camera.
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  app.camera.quaternion.setFromEuler(euler);
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const el = app.renderer.domElement;
  el.style.cursor = 'grab';
  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  window.addEventListener('pointerup', () => (dragging = false));
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    euler.y -= (e.clientX - lastX) * 0.005;
    euler.x -= (e.clientY - lastY) * 0.005;
    euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
    lastX = e.clientX;
    lastY = e.clientY;
    app.camera.quaternion.setFromEuler(euler);
  });
}

// ---------------------------------------------------------------------------
// Debug overlay
// ---------------------------------------------------------------------------
const _dir = new THREE.Vector3();

/** Heading the three.js camera is actually facing: 0 = north (-z), 90 = east (+x). */
function cameraHeadingDeg(cam: THREE.Camera): number {
  cam.getWorldDirection(_dir);
  return (THREE.MathUtils.radToDeg(Math.atan2(_dir.x, -_dir.z)) + 360) % 360;
}

function fmt(n: number | null | undefined, d = 1): string {
  return n === null || n === undefined || Number.isNaN(n) ? '—' : n.toFixed(d);
}

function debugLoop(): void {
  const app = state.app;
  if (!app) return;
  const fix = state.lastFix;
  const o = state.lastOrient;
  const cam = app.camera;

  // One block per site. geo = computed from lat/lon; scene = from three.js
  // positions. They should agree; a mismatch means a placement/projection bug.
  const siteRows: Array<[string, string]> = [];
  for (const site of SITES) {
    const placed = state.placed.find((p) => p.site === site);
    const obj = placed?.object.group;
    let scene = '—';
    if (obj) {
      const dx = obj.position.x - cam.position.x;
      const dz = obj.position.z - cam.position.z;
      const b = (THREE.MathUtils.radToDeg(Math.atan2(dx, -dz)) + 360) % 360;
      scene = `${fmt(Math.hypot(dx, dz), 1)} m @ ${fmt(b, 0)}°`;
    }
    siteRows.push(
      [`--- ${site.name}`, placed ? placed.object.description : state.placing ? 'placing…' : 'not placed (waiting for accepted fix)'],
      ['geo', fix ? `${fmt(distanceM(fix.coords, site), 1)} m @ ${fmt(bearingDeg(fix.coords, site), 0)}°` : '—'],
      ['scene', scene],
      ['object xyz', obj ? `${fmt(obj.position.x, 2)} ${fmt(obj.position.y, 2)} ${fmt(obj.position.z, 2)}` : '—'],
      ['anchor/centre', placed ? `${fmt(anchorHeightM(site), 3)} / ${fmt(anchorHeightM(site) + placed.object.centreOffsetM, 3)} m` : fmt(anchorHeightM(site), 3)],
    );
  }

  const ios = isIOSLike();
  const compassAvailable = typeof o?.webkitCompassHeading === 'number';

  setDebug([
    ['mode', `${FAKE ? `FAKE GPS near ${FAKE_SITE.name}` : 'live'}${state.dragLook ? ' · drag-look' : ''}`],
    ['webcam', state.webcamStarted ? 'started' : 'not started'],
    ['--- GPS', ''],
    ['lat', fmt(fix?.coords.latitude, 6)],
    ['lon', fmt(fix?.coords.longitude, 6)],
    ['accuracy m', fmt(fix?.coords.accuracy, 1)],
    ['altitude m', fmt(fix?.coords.altitude, 1)],
    ['fixes raw/ok', `${state.fixCount} / ${state.acceptedCount}`],
    ['last fix ago', fix ? `${((performance.now() - state.lastFixAt) / 1000).toFixed(1)} s` : '—'],
    ['--- CAMERA', ''],
    ['camera xyz', `${fmt(cam.position.x, 2)} ${fmt(cam.position.y, 2)} ${fmt(cam.position.z, 2)}`],
    ['cam heading', `${fmt(cameraHeadingDeg(cam), 0)}°`],
    ...siteRows,
    ['--- ORIENTATION', ''],
    ['event', state.orientEventName],
    ['rate', `${state.orientRateHz} Hz (${state.orientCount} total)`],
    ['alpha', fmt(o?.alpha, 1)],
    ['beta', fmt(o?.beta, 1)],
    ['gamma', fmt(o?.gamma, 1)],
    ['absolute', o ? String(o.absolute) : '—'],
    ['webkitCompass', compassAvailable ? `${fmt(o?.webkitCompassHeading, 1)}° (acc ${fmt(o?.webkitCompassAccuracy, 0)})` : 'n/a'],
    ['compass in use', ios ? (compassAvailable ? 'yes (iOS path)' : 'iOS path but no value yet') : 'no (alpha path)'],
    ['screen angle', String(screen.orientation?.angle ?? '—')],
    ['--- ENV', ''],
    ['viewport', `${innerWidth}×${innerHeight} @${devicePixelRatio}`],
    ['secure', String(window.isSecureContext)],
    ['UA', navigator.userAgent],
  ]);

  requestAnimationFrame(debugLoop);
}
