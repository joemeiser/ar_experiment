/** Browser API surface not covered by the TS DOM lib. */

interface DeviceOrientationEvent {
  /** iOS/iPadOS Safari only: true compass heading, degrees clockwise from north. */
  readonly webkitCompassHeading?: number;
  readonly webkitCompassAccuracy?: number;
}

/** iOS 13+ only; must be called from a user gesture. Not in lib.dom, so callers cast to this. */
type DeviceOrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

interface Window {
  /** Present on Android Chrome; absent on iOS Safari. */
  ondeviceorientationabsolute?: ((this: Window, ev: DeviceOrientationEvent) => unknown) | null;
}
