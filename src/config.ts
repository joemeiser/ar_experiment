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
   * URL of a .glb/.gltf to show instead of the cube. Relative URLs are
   * resolved against the site base (put files in /public and use e.g. 'models/sculpture.glb').
   * null = show the test cube.
   */
  modelUrl: string | null;
  /** Uniform scale applied to the loaded model. */
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
      cubeColor: '#1e63ff', // blue, so the two cubes can't be confused; delete to use the default red
    },
  ],

  object: {
    groundClearanceM: 3.048, // 10 ft
    modelUrl: null,
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

  fakeViewerOffsetSouthM: 40,
};

/** All sites with defaults applied. */
export function resolvedSites(c: AppConfig = config): ResolvedSite[] {
  return c.sites.map((s) => ({ ...c.object, ...s }));
}
