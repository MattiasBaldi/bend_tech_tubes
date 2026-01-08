import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import GUI from 'lil-gui';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let group: THREE.Group;
let stats: Stats;
let controls: OrbitControls;
let tubeMesh: THREE.Mesh<THREE.TubeGeometry, THREE.MeshStandardMaterial> | null = null;

const BEND_RADIUS = 3;

interface Bend {
  length: number;
  angle: number;
  rotation: number;
}

// 4 parametric bends (Bend-Tech style)
const bends: Bend[] = [
  { length: 8.5, angle: 100, rotation: 0 },
  { length: 5, angle: 66, rotation: 120 },
  { length: 5.25, angle: 66, rotation: 0 },
  { length: 5, angle: 100, rotation: -120 }
];

let endLength = 8.5;
const cameraControls = { x: 5, y: 0, z: 5 };

init();

async function init(): Promise<void> {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 2000);
  camera.position.set(cameraControls.x, cameraControls.y, cameraControls.z);

  group = new THREE.Group();
  group.scale.setScalar(0.1);
  scene.add(group);

  const env: THREE.Texture = await new HDRLoader().loadAsync(
    'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/potsdamer_platz_1k.hdr'
  );
  env.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = env;

  buildTube();

  const gui = new GUI();
  bends.forEach((b, i) => {
    const f = gui.addFolder(`Bend ${i + 1}`);
    f.add(b, 'length', 0, 20).onChange(buildTube);
    f.add(b, 'angle', -180, 180).onChange(buildTube);
    f.add(b, 'rotation', -180, 180).onChange(buildTube);
  });

  gui.add({ endLength }, 'endLength', 0, 20).onChange((v: number) => {
    endLength = v;
    buildTube();
  });

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  stats = new Stats();
  document.body.appendChild(stats.dom);

  animate();
}

function buildTube(): void {
  if (tubeMesh) {
    tubeMesh.geometry.dispose();
    tubeMesh.material.dispose();
    group.remove(tubeMesh);
  }

  const path = new THREE.CurvePath<THREE.Vector3>();

  let pos = new THREE.Vector3(0, 0, 0);
  let tangent = new THREE.Vector3(1, 0, 0);
  let normal = new THREE.Vector3(0, 1, 0);

  bends.forEach((b) => {
    // straight
    const nextPos = pos.clone().add(tangent.clone().multiplyScalar(b.length));
    path.add(new THREE.LineCurve3(pos.clone(), nextPos.clone()));
    pos.copy(nextPos);

    // rotate frame (bend rotation)
    const roll = new THREE.Quaternion().setFromAxisAngle(tangent, THREE.MathUtils.degToRad(b.rotation));
    normal.applyQuaternion(roll);

    // bend arc
    const axis = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    const arcAngle = THREE.MathUtils.degToRad(b.angle);
    const arc = makeArc3D(pos, tangent, axis, BEND_RADIUS, arcAngle);
    path.add(arc);

    // advance frame
    pos.copy(arc.getPoint(1));
    tangent.applyAxisAngle(axis, arcAngle);
    normal.applyAxisAngle(axis, arcAngle);
  });

  // final straight
  const endPos = pos.clone().add(tangent.clone().multiplyScalar(endLength));
  path.add(new THREE.LineCurve3(pos, endPos));

  const geom = new THREE.TubeGeometry(path, 300, 0.5, 24);

  // center geometry at origin
  geom.computeBoundingBox();
  const center = new THREE.Vector3();
  geom.boundingBox!.getCenter(center);
  const size = new THREE.Vector3();
  geom.boundingBox!.getSize(size);
  geom.translate(-center.x, -center.y, -center.z);

  // determine dominant axis
  let axis: 'x' | 'y' | 'z' = 'x';
  if (size.y > size.x && size.y > size.z) axis = 'y';
  if (size.z > size.x && size.z > size.y) axis = 'z';

  // rotate geometry to align dominant axis to X
  const m = new THREE.Matrix4();
  if (axis === 'y') {
    m.makeRotationZ(-Math.PI / 2);
    geom.applyMatrix4(m);
  }
  if (axis === 'z') {
    m.makeRotationY(Math.PI / 2);
    geom.applyMatrix4(m);
  }

  const mat = new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0 });
  tubeMesh = new THREE.Mesh(geom, mat);
  group.add(tubeMesh);
}

function makeArc3D(
  origin: THREE.Vector3,
  tangent: THREE.Vector3,
  axis: THREE.Vector3,
  radius: number,
  angle: number
): THREE.CatmullRomCurve3 {
  const center = origin.clone().add(new THREE.Vector3().crossVectors(axis, tangent).normalize().multiplyScalar(radius));
  const points: THREE.Vector3[] = [];
  const segments = 32;

  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * angle;
    const q = new THREE.Quaternion().setFromAxisAngle(axis, t);
    const p = origin.clone().sub(center).applyQuaternion(q).add(center);
    points.push(p);
  }

  return new THREE.CatmullRomCurve3(points, false);
}


function animate(): void {
  requestAnimationFrame(animate);
  stats.update();
  controls.update();
  renderer.render(scene, camera);
}
