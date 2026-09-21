/** Small geodesy helpers. All angles in degrees, distances in metres. */

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export interface LatLon {
  latitude: number;
  longitude: number;
}

/** Great-circle distance (haversine). */
export function distanceM(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Initial bearing from a to b, 0..360, clockwise from true north. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const p1 = toRad(a.latitude);
  const p2 = toRad(b.latitude);
  const dl = toRad(b.longitude - a.longitude);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Point `northM` metres north and `eastM` metres east of `origin` (flat-earth, fine for < 1 km). */
export function offsetLatLon(origin: LatLon, northM: number, eastM: number): LatLon {
  const dLat = toDeg(northM / R);
  const dLon = toDeg(eastM / (R * Math.cos(toRad(origin.latitude))));
  return { latitude: origin.latitude + dLat, longitude: origin.longitude + dLon };
}

/**
 * Local equirectangular projection in true metres, for LocAR's `projection` option.
 *
 * Why: LocAR's default is Spherical (Web) Mercator, whose units are only metres at
 * the equator. At latitude φ every horizontal distance is inflated by 1/cos φ
 * (×1.325 at Lewisburg, 41°N), while object heights and sizes are not — so objects
 * render too far away, too small and too low. This projection is scaled at a fixed
 * reference latitude; within a few km of it the distance error is < 0.1 %.
 *
 * Implements LocAR's Projection interface: project(lon, lat) -> [easting, northing].
 */
export class LocalMetricProjection {
  private readonly kx: number;
  private readonly ky = (Math.PI / 180) * R;

  constructor(refLatitude: number) {
    this.kx = this.ky * Math.cos(toRad(refLatitude));
  }

  project = (lon: number, lat: number): [number, number] => [lon * this.kx, lat * this.ky];

  unproject = (p: [number, number]): [number, number] => [p[0] / this.kx, p[1] / this.ky];
}
