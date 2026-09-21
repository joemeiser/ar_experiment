/**
 * Builds the AR object (test cube or GLB) and computes where it sits vertically.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { config, type ObjectSettings } from './config';

/**
 * Height (metres) of the object's ANCHOR point (its lowest point) in LocAR world
 * space. LocAR.js keeps the camera at y = 0 and never applies a ground offset
 * (verified in locar 0.2.12: `add()` writes `elev` straight into position.y and
 * `setElevation()` only moves the camera). So "ground" in scene units is at
 * y = -viewerEyeHeightM, and the anchor is groundClearance above that.
 *
 * With defaults: 3.048 - 1.5 = 1.548 m -> cube centre at 1.548 + 1.524 = 3.072 m
 * above the camera, i.e. 4.572 m above the ground the viewer is standing on.
 */
export function anchorHeightM(o: Pick<ObjectSettings, 'groundClearanceM'>, viewerEyeHeightM = config.viewerEyeHeightM): number {
  return o.groundClearanceM - viewerEyeHeightM;
}

export interface BuiltObject {
  /** Group whose origin is the object's lowest point; pass this to locar.add(). */
  group: THREE.Group;
  /** Human-readable description for the debug overlay. */
  description: string;
  /** Height of the object's centre above the anchor, metres. */
  centreOffsetM: number;
}

export function buildCube(c: ObjectSettings): BuiltObject {
  const group = new THREE.Group();
  const geom = new THREE.BoxGeometry(c.cubeSizeM, c.cubeSizeM, c.cubeSizeM);
  // Standard material + lights so the faces shade differently; a MeshBasicMaterial
  // cube reads as a flat red hexagon and you cannot judge its orientation.
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(c.cubeColor), roughness: 0.6, metalness: 0.0 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.y = c.cubeSizeM / 2; // bottom face at group origin
  group.add(mesh);
  // Edges make the silhouette legible against the camera feed.
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geom),
    new THREE.LineBasicMaterial({ color: 0x000000 }),
  );
  edges.position.copy(mesh.position);
  group.add(edges);
  return { group, description: `cube ${c.cubeSizeM} m ${c.cubeColor}`, centreOffsetM: c.cubeSizeM / 2 };
}

export async function buildModel(url: string, c: ObjectSettings): Promise<BuiltObject> {
  // Resolve relative URLs against the Vite base so it works under /REPO_NAME/.
  const resolved = new URL(url, new URL(import.meta.env.BASE_URL, window.location.href)).href;
  const gltf = await new GLTFLoader().loadAsync(resolved);
  const model = gltf.scene;
  model.scale.setScalar(c.modelScale);
  model.rotation.set(
    THREE.MathUtils.degToRad(c.modelRotation.x),
    THREE.MathUtils.degToRad(c.modelRotation.y),
    THREE.MathUtils.degToRad(c.modelRotation.z),
  );
  model.updateMatrixWorld(true);
  // Shift so the model's lowest point sits at the group origin.
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  model.position.y -= box.min.y;
  const group = new THREE.Group();
  group.add(model);
  return {
    group,
    description: `model ${url} (${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)} m after scale)`,
    centreOffsetM: size.y / 2,
  };
}

export async function buildObject(c: ObjectSettings): Promise<BuiltObject> {
  return c.modelUrl ? buildModel(c.modelUrl, c) : buildCube(c);
}

export function addLights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(30, 80, 20);
  scene.add(sun);
}
