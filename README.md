# WebAR Sculpture Viewer — MVP

Location-based AR in the browser: open a link, tap **Start AR**, walk to the site, hold the device up, see a red 10 ft cube floating 10 ft above the ground at a GPS coordinate.

Stack: Vite 8 · Three.js 0.181 · [LocAR.js](https://github.com/AR-js-org/locar.js) 0.2.12 · TypeScript · GitHub Pages via GitHub Actions. No native app, no backend.

**Purpose:** find out whether browser GPS+compass AR is reliable enough for a course project. Expect the cube to be off by metres and to drift. The debug overlay exists so you can measure how much.

> Status: builds, type-checks, and renders correctly in headless Chromium with fake GPS and a fake camera (both sites; scene distances match geodesic distances to 0.1 m). **Not yet tested on a physical device** — GPS, compass and iOS permissions are unverified. See "What to expect" below.

---

## Layout

```
index.html                 landing screen, status bar, banner, debug <pre>
vite.config.ts             REPO_NAME = ar_experiment (base path)
src/config.ts              sites (lat/lon), heights, cube, model  <-- the only file you should need to edit
src/main.ts                permissions, LocAR setup, GPS, status, debug overlay
src/sculpture.ts           builds the cube / loads a .glb; vertical placement math
src/checks.ts              preflight capability checks
src/errors.ts              human-readable error messages
src/geo.ts                 haversine / bearing helpers, true-metre projection for LocAR
public/models/             put .glb files here
.github/workflows/deploy.yml
```

## Run locally

```bash
npm install
npm run dev          # http://localhost:5173/ar_experiment/  (desktop; use ?debug=1&fake=1)
```

Node ≥ 22.12 required (Vite 8).

### Testing on a phone over LAN (HTTPS)

Camera, GPS and motion sensors all require a secure context. `localhost` counts; `http://192.168.x.x` does not.

```bash
npm run dev:https    # self-signed cert via @vitejs/plugin-basic-ssl
```

Open `https://<your-laptop-ip>:5173/ar_experiment/` on the phone and accept the certificate warning (Android Chrome: Advanced → Proceed; iOS Safari: Show Details → visit website). iOS is sometimes stubborn about self-signed certs for sensor permissions — if it fails, **just push and test on the deployed Pages URL**, which is real HTTPS. That is the recommended path.

### Desktop fake mode

`http://localhost:5173/ar_experiment/?debug=1&fake=1` — uses `locar.fakeGps()` to place you 40 m south of site 1 facing north (cube dead ahead); `fake=2` does the same for site 2, still needs a webcam. Desktops have no orientation sensors, so after ~1.5 s with no events the app switches to **drag to look**. This verifies rendering, placement math and the overlay, not GPS or compass.

## Sites (GPS coordinates)

Every entry in `sites` in `src/config.ts` gets its own object:

```ts
sites: [
  { name: 'Site 1', latitude: 40.95168, longitude: -76.8821 },
  { name: 'Site 2', latitude: 40.967995, longitude: -76.896068, cubeColor: '#1e63ff' },
],
```

- To move a site, edit its numbers. To add one, append an entry. To remove one, delete it.
- Any field in `object` (`cubeColor`, `cubeSizeM`, `groundClearanceM`, `modelUrl`, `modelScale`, `modelRotation`) can be overridden per site. Otherwise the shared default applies.
- The status bar shows distance to the **nearest** site. `?debug=1` lists every site.
- Commit, push, wait for the Action (~1 min).

Site 1 is an **estimate (±20 m)** of the midpoint between the water tower and Holmes Hall. Site 2 is a dropped pin, ~2.16 km NNW of site 1, drawn blue so the two can't be confused. Get coordinates by long-pressing in Google Maps and copying the decimal degrees.

`cameraFarM` (5000) is the draw distance. Objects farther away are not rendered. In practice a 3 m cube is under one pixel beyond ~1 km anyway.

### Projection (fixed bug)

LocAR's default projection is Web Mercator. Its units are metres only at the equator; at 41°N it inflates horizontal distances ×1.325, while heights and object sizes stay true. Result: every object rendered 33% too far away, too small and too low. The app now passes LocAR a local true-metre projection (`LocalMetricProjection` in `src/geo.ts`, via App's `projection` option). The debug overlay's `geo` and `scene` rows should agree; if they don't, placement is wrong.

## Replace the cube with a .glb

1. Drop the file in `public/models/`, e.g. `public/models/sculpture.glb`.
2. In `src/config.ts`:
   ```ts
   modelUrl: 'models/sculpture.glb',   // relative to the site base
   modelScale: 1,                       // 1 unit in the file = 1 metre
   modelRotation: { x: 0, y: 0, z: 0 }, // degrees
   ```
3. Placement rule (same as the cube): the model's **lowest point** after scale/rotation is placed `groundClearanceM` above the ground. You don't have to centre the model's origin yourself.

Keep files small (< 10 MB, ideally Draco/meshopt-compressed); it downloads over cellular on campus.

## How height works (read this)

LocAR.js keeps the camera at `y = 0` and writes the `elev` you pass to `locar.add()` straight into `object.position.y`. There is no ground plane. So heights are **relative to the camera lens**, not the ground.

`src/sculpture.ts`:

```
anchorY = groundClearanceM − viewerEyeHeightM      = 3.048 − 1.5   = 1.548 m
cube centre = anchorY + cubeSizeM / 2              = 1.548 + 1.524 = 3.072 m above the camera
                                                   = 4.572 m above the ground under the viewer
```

Nothing is hard-coded; change `groundClearanceM` or `viewerEyeHeightM` in config and the math follows. The debug overlay prints `anchor y` and `centre y`.

## Deploy to GitHub Pages

1. `REPO_NAME` in `vite.config.ts` is `ar_experiment`. If you rename the repo, change it to match.
2. Repo → **Settings → Pages → Source: GitHub Actions**.
3. Push to `main`. The workflow in `.github/workflows/deploy.yml` builds and deploys. URL: `https://joemeiser.github.io/ar_experiment/`.

## Errors handled

| Situation | What the user sees |
|---|---|
| Not HTTPS | Fatal preflight message, Start disabled |
| No WebGL | Fatal preflight message, Start disabled |
| No camera API (in-app browsers) | Fatal preflight message |
| Firefox / iOS in-app browser | Warning, Start still allowed |
| Camera denied / busy / none / no rear | Error banner with per-OS instructions to re-allow |
| Orientation denied (iOS) | Error banner: close tab and reopen (iOS won't re-prompt) |
| No orientation events after 4 s | Warning: view won't follow the device |
| Location denied / unavailable | Error banner with settings path |
| No fix after 20 s | Warning: stand in open sky, keep waiting |
| Accuracy > 20 m | Yellow status bar + warning |
| Accuracy > 100 m | Warning: **LocAR is ignoring this fix** (typical for Wi-Fi-only iPad) |
| .glb fails to load | Error banner pointing at `modelUrl` |

## Debug mode

Append `?debug=1`. Overlay shows: mode, lat/lon, accuracy, altitude, raw vs accepted fix counts, time since last fix, geodesic distance and bearing to target, object and camera world positions, in-scene distance/bearing (should match the geodesic ones — if not, the projection is wrong), camera heading, orientation event name and rate, alpha/beta/gamma/absolute, `webkitCompassHeading` and whether the iOS compass path is in use, screen angle, viewport, user agent.

Add `&fake=1` (or `&fake=2`, …) for the desktop fake GPS described above. Each site gets a block: `geo` (distance @ bearing from lat/lon) and `scene` (from three.js positions). The two should match.

## Known limitations (be honest with students)

- **GPS error.** ~3–8 m in open sky with a phone; 10–30 m near buildings and under trees; worse in the first 30 s. The cube moves when your fix moves. At a 20 m viewing distance a 5 m error is a 14° angular shift.
- **Wi-Fi-only iPads have no GPS receiver.** They position from Wi-Fi/IP, typically 65 m+ accuracy, which LocAR discards (cutoff 100 m in config). Expect these to never place the object reliably. The status bar will show `(ignored)`. Only Wi-Fi + Cellular iPads have GPS.
- **Compass error.** Magnetometers are commonly 5–15° off and are disturbed by cars, rebar, fences. At 50 m, 10° is ≈ 9 m sideways. Figure-8 calibration helps for a minute. Android delivers `deviceorientationabsolute`; iOS uses `webkitCompassHeading`. LocAR's README notes north is wrong on some devices by a consistent offset.
- **No occlusion.** The cube draws in front of buildings, trees and people. There is no depth sensing in WebAR.
- **Terrain.** Heights are relative to the camera, so if the ground at the target is 2 m lower than where you stand, the cube appears 2 m too high (and vice versa). Campus is hilly; the estimated site is on a slope. Nothing in the code can fix this without an elevation source.
- **No visual-inertial tracking.** Unlike ARKit/ARCore, nothing tracks the camera visually. Walking produces steps in the object position as fixes arrive, not smooth motion. Turning is smooth (gyro), translating is not.
- **Scale perception.** A 3 m cube 50 m away is small on screen; with an 80° FOV it spans ~3.5° of view. Test at 20 m first.
- Firefox (any OS) and in-app browsers are unsupported.

## What to expect on first device test

Things I could not verify without hardware, in order of likelihood of biting you:

1. **iOS permission order.** The app calls `DeviceOrientationEvent.requestPermission()` inside the Start tap, *then* constructs LocAR (camera prompt), *then* starts GPS. If Safari refuses the orientation prompt, the banner will say so; reload and tap Start again — the prompt only fires from a user gesture.
2. **Video letterboxing / FOV.** LocAR matches the three.js FOV to the camera feed's visible portion. If the cube looks too big/small relative to the world, adjust `cameraHFovDeg` (try 60–70 for phones) and compare with a known-size object.
3. **Cube behind you or at the wrong bearing** → compass. Check `cam heading` vs `bearing geo` in debug while pointing the phone at where the cube should be. Consistent offset = calibration or a device quirk.
4. **Cube way too high/low** → check `altitude m` isn't being used (it isn't) and reconsider `viewerEyeHeightM` for a held-up phone (~1.5–1.6 m).

---

## Step-by-step: push, deploy, test

Repo: <https://github.com/joemeiser/ar_experiment> · Site: <https://joemeiser.github.io/ar_experiment/>

### 1. Push

```bash
cd webar-sculpture-viewer
git init
git add .
git commit -m "WebAR sculpture viewer MVP"
git branch -M main
git remote add origin https://github.com/joemeiser/ar_experiment.git
git push -u origin main
```

### 2. Enable Pages and deploy

1. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Actions** tab → `Deploy to GitHub Pages`. If the first run failed because Pages wasn't enabled yet, open it → **Re-run all jobs**.
3. When green (~1 min), open <https://joemeiser.github.io/ar_experiment/> on a laptop: landing page, no red boxes.

### 3. Enter a test coordinate

1. Google Maps → long-press the exact spot → copy the two numbers shown (e.g. `40.95170, -76.88205`).
2. Edit `src/config.ts` → the site's `latitude`, `longitude` in `sites`.
3. `git commit -am "Set site coordinate" && git push`. Wait for the Action (~1 min). Hard-refresh the phone.

Tip for a first sanity check: set the coordinate to somewhere you can stand 20 m from in open sky (a parking lot), not the final site.

### 4. Test on Android Chrome

1. Open the Pages URL in Chrome (not from inside a QR-scanner's built-in browser — tap "open in Chrome").
2. Tap **Start AR** → Allow camera → Allow location ("Precise", "While using").
3. Status bar should read `GPS: waiting for fix…`, then `GPS ±N m · Target N m` within 5–30 s outdoors.
4. Once a fix is accepted, turn toward the target bearing. The cube appears. If the bar is yellow, accuracy is > 20 m: wait, move into the open.
5. If the cube is off to one side, calibrate the compass: wave the phone in a figure-8 for 10 s, or open Google Maps and tap the blue dot → **Calibrate**.
6. Reload with `?debug=1`. Record: `accuracy m`, `cam heading` when pointing at where the cube *should* be, `bearing geo`. The difference is your compass error.
7. Repeat at ~20 m, ~50 m, ~100 m from the target, from different sides.

### 5. Test on iPad Safari

1. First check **Settings → General → About → Model Name**: Wi-Fi + Cellular has GPS; Wi-Fi-only does not and will likely show `(ignored)` with accuracy ≥ 65 m. Test both if you have them — the difference is a result in itself.
2. Open the Pages URL in **Safari** (not an in-app browser).
3. Tap **Start AR**. Three prompts, in this order:
   - *"…would like to access Motion & Orientation"* → **Allow**. This must come from your tap; if you see "denied", close the tab (swipe away), reopen the URL, try again. iOS does not re-prompt in the same tab.
   - *Camera* → **Allow**.
   - *Location* → **Allow While Using App** and make sure **Precise: On**.
4. If Safari never shows the motion prompt on older iPadOS (< 13): **Settings → Safari → Motion & Orientation Access** → on.
5. Compass calibration on iOS is automatic; move the iPad in a figure-8 if the cube is clearly off. Holding the iPad in landscape is fine — LocAR handles `screen.orientation.angle`.
6. `?debug=1`: confirm `compass in use: yes (iOS path)` and that `webkitCompass` has a value. Record `accuracy m` — for Wi-Fi-only iPads this is the headline number.

### 6. What to record per position

| device | position (~m) | accuracy m | cam heading | bearing geo | Δ° | cube looks (L/R/high/low) |
|---|---|---|---|---|---|---|

Stand still 20 s before reading; the first fixes are the worst.
