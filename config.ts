/**
 * SINGLE SOURCE OF TRUTH for the sculpture sites and test objects.
 * Edit this file, commit, push — nothing else needs to change.
 *
 * To add a site: append an entry to `sites`. Any object setting (colour, size,
 * clearance, model) can be overridden per site; anything omitted uses the
 * shared defaults in `object`.
 */

/** Settings that describe the object drawn at a site. */
export interface ObjectSettings {
  /** Gap between the ground and the LOWEST point of the object, metres. */
  groundClearanceM: number;

  /**
   * URL of a .glb, .gltf or .obj to show instead of the cube. Relative URLs are
   * resolved against the site base: put files in public/models/ and use e.g.
   * 'models/sculpture.glb'. An .obj's .mtl and textures go in the same folder.
   * null = show the test cube.
   */
  modelUrl: string | null;
  /**
   * Scale the model so it is exactly this tall, metres (after rotation).
   * Use this when you don't know the file's units. null = use modelScale instead.
   */
  modelHeightM: number | null;
  /** Uniform scale applied to the loaded model when modelHeightM is null. 1 = file units are metres. */
  modelScale: number;
  /** Rotation applied to the loaded model, DEGREES, applied in x, y, z order. */
  modelRotation: { x: number; y: number; z: number };

  /** Edge length of the test cube, metres. */
  cubeSizeM: number;
  /** Any CSS colour string understood by THREE.Color. */
  cubeColor: string;
}

export interface SiteConfig extends Partial<ObjectSettings> {
  /** Short label shown in the status bar and debug overlay. */
  name: string;
  /** WGS84 latitude (decimal degrees, north positive). */
  latitude: number;
  /** WGS84 longitude (decimal degrees, east positive; PA is negative). */
  longitude: number;
}

/** A site with every object setting filled in. */
export type ResolvedSite = SiteConfig & ObjectSettings;

export interface AppConfig {
  sites: SiteConfig[];
  /** Defaults for every site's object; per-site fields override these. */
  object: ObjectSettings;

  /**
   * Assumed height of the viewer's eye / camera above the ground, metres.
   * LocAR.js keeps the camera at y = 0, so object heights are expressed
   * relative to the camera, not the ground. See sculpture.ts: anchorHeightM().
   */
  viewerEyeHeightM: number;

  /** Status bar shows a warning when GPS accuracy is worse than this, metres. */
  poorAccuracyThresholdM: number;
  /**
   * LocAR.js silently IGNORES fixes with accuracy worse than this (metres).
   * The raw value is still shown in the status bar/debug overlay so you can
   * see it happening. Wi-Fi-only iPads often report 65 m or worse.
   */
  gpsMinAccuracyM: number;
  /** LocAR.js only moves the camera when you have moved at least this far, metres. 0 = every fix. */
  gpsMinDistanceM: number;
  /** Show a "GPS timeout" warning if no fix arrives within this many ms. */
  gpsTimeoutMs: number;

  /** Horizontal field of view LocAR uses for the three.js camera, degrees. */
  cameraHFovDeg: number;
  /**
   * Objects farther than this from the camera are not drawn, metres.
   * Must exceed the largest distance you want to see an object from.
   */
  cameraFarM: number;

  /**
   * Orientation smoothing, 0..1 (LocAR's smoothingFactor). Each frame the view
   * moves (1 - this) of the way toward the latest sensor reading.
   * Higher = steadier but laggier. LocAR's default 0.2 is almost unsmoothed.
   */
  orientationSmoothing: number;
  /**
   * GPS position smoothing time constant, seconds. New fixes are eased in over
   * roughly this long instead of snapping, so the object glides rather than jumps.
   * 0 = no smoothing (original behaviour).
   */
  gpsSmoothingSec: number;
  /** A fix farther than this from the smoothed position is applied instantly, metres. */
  gpsSnapDistanceM: number;

  /**
   * ?debug=1&fake=N places the fake viewer this many metres SOUTH of site N
   * (1-based), so that object is straight ahead (north = -z, the default camera direction).
   */
  fakeViewerOffsetSouthM: number;
}

export const config: AppConfig = {
  sites: [
    {
      // Midpoint between the Bucknell water tower and Holmes Hall, Lewisburg PA.
      // ESTIMATE, ±20 m. Replace with a dropped-pin coordinate.
      name: 'Site 1',
      latitude: 40.95168,
      longitude: -76.8821,
    },
    {
      // Dropped pin, 2026-09-21. ~2.16 km NNW (bearing 327°) of Site 1.
      name: 'Site 2',
      latitude: 40.967995,
      longitude: -76.896068,
      // Dogs sculpture instead of a cube. File: public/models/dogs.obj
      // (+ dogs.mtl and textures alongside it, if it has them).
      modelUrl: 'models/dogs.obj',
      modelHeightM: 3.048, // 10 ft tall, same as the cube; change to taste
    },
  ],

  object: {
    groundClearanceM: 3.048, // 10 ft
    modelUrl: null,
    modelHeightM: null,
    modelScale: 1,
    modelRotation: { x: 0, y: 0, z: 0 },
    cubeSizeM: 3.048, // 10 ft
    cubeColor: '#ff0000',
  },

  viewerEyeHeightM: 1.5,

  poorAccuracyThresholdM: 20,
  gpsMinAccuracyM: 100,
  gpsMinDistanceM: 0,
  gpsTimeoutMs: 20000,

  cameraHFovDeg: 80,
  cameraFarM: 5000,

  orientationSmoothing: 0.85,
  gpsSmoothingSec: 1.5,
  gpsSnapDistanceM: 30,

  fakeViewerOffsetSouthM: 40,
};

/** All sites with defaults applied. */
export function resolvedSites(c: AppConfig = config): ResolvedSite[] {
  return c.sites.map((s) => ({ ...c.object, ...s }));
}
