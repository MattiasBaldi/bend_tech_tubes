import * as THREE from 'three';
import { NURBSCurve } from 'three/addons/curves/NURBSCurve.js';
import Stats from 'three/addons/libs/stats.module.js';
import GUI from 'lil-gui';
import {HDRLoader} from 'three/examples/jsm/loaders/HDRLoader.js'
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js'

let scene, camera, renderer, group, stats, controls;
let nurbsCurve, nurbsLine;

// 4 parametric bends
const bends = [
    { length: 8.5, angle: 100, rotation: 0, dimType: 'tangent' },
    { length: 5, angle: 66, rotation: 120, dimType: 'tangent' },
    { length: 5.25, angle: 66, rotation: 0, dimType: 'tangent' },
    { length: 5, angle: 100, rotation: -120, dimType: 'tangent' }
];

// final straight end
let endLength = 8.5;

// camera controls
const cameraControls = { x: 5, y: 0, z: 5 };

init();

async function init() {

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.set(cameraControls.x, cameraControls.y, cameraControls.z);

    group = new THREE.Group();
    group.scale.setScalar(0.1)
    scene.add(group);

    const loader = new HDRLoader();
    const envMap = await loader.loadAsync( 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/potsdamer_platz_1k.hdr' );
    envMap.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = envMap;

    // Build initial curve
    updateNURBSCurve();

    // GUI
    const gui = new GUI();

    // Bend parameters
    bends.forEach((b, i) => {
        const folder = gui.addFolder(`Bend ${i + 1}`);
        folder.add(b, 'length', 0, 10).onChange(updateNURBSCurve);
        folder.add(b, 'angle', -180, 180).onChange(updateNURBSCurve);
        folder.add(b, 'rotation', -180, 180).onChange(updateNURBSCurve);
        folder.add(b, 'dimType', ['tangent', 'apex']).onChange(updateNURBSCurve);
    });

    // End length
    gui.add({ endLength }, 'endLength', 0, 20).name('End Length').onChange(value => {
        endLength = value;
        updateNURBSCurve();
    });

    // Camera controls
    const camFolder = gui.addFolder('Camera Position');
    camFolder.add(cameraControls, 'x', -500, 500).onChange(updateCamera);
    camFolder.add(cameraControls, 'y', -500, 500).onChange(updateCamera);
    camFolder.add(cameraControls, 'z', -500, 1500).onChange(updateCamera);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);


    // controls
    controls = new OrbitControls(camera, renderer.domElement)

    stats = new Stats();
    document.body.appendChild(stats.dom);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    animate();
}

function updateCamera() {
    camera.position.set(cameraControls.x, cameraControls.y, cameraControls.z);
}

// Convert bend parameters to 3D control points
function computeControlPoints() {
    const points = [];
    let currentPos = new THREE.Vector3(0, 0, 0);
    let tangent = new THREE.Vector3(1, 0, 0); // initial direction
    let up = new THREE.Vector3(0, 1, 0);      // initial up vector

    bends.forEach(b => {
        const rotQuat = new THREE.Quaternion().setFromAxisAngle(tangent, THREE.MathUtils.degToRad(b.rotation));
        up.applyQuaternion(rotQuat);

        const axis = new THREE.Vector3().crossVectors(tangent, up).normalize();
        const angleRad = THREE.MathUtils.degToRad(b.angle);

        const midTangent = tangent.clone().applyAxisAngle(axis, angleRad / 2);
        const midPoint = currentPos.clone().add(midTangent.clone().multiplyScalar(b.length));

        points.push(currentPos.clone());
        points.push(midPoint);

        currentPos.add(tangent.clone().applyAxisAngle(axis, angleRad).multiplyScalar(b.length));
        tangent.applyAxisAngle(axis, angleRad);
    });

    // final straight segment
    const endPoint = currentPos.clone().add(tangent.clone().multiplyScalar(endLength));
    points.push(currentPos.clone());
    points.push(endPoint);

    return points;
}

// Rebuild NURBS curve and update line geometry
function updateNURBSCurve() {
  if(nurbsLine) {
    nurbsLine.geometry.dispose()
    nurbsLine.material.dispose()
    group.remove(nurbsLine)
 
  }
    const controlPoints3 = computeControlPoints();
    const nurbsDegree = 4;

    const knots = [];
    for (let i = 0; i <= nurbsDegree; i++) knots.push(0);
    for (let i = 0; i < controlPoints3.length; i++) {
        const knot = (i + 1) / (controlPoints3.length - nurbsDegree);
        knots.push(THREE.MathUtils.clamp(knot, 0, 1));
    }

    const controlPoints4 = controlPoints3.map(p => new THREE.Vector4(p.x, p.y, p.z, 1));
    nurbsCurve = new NURBSCurve(nurbsDegree, knots, controlPoints4);

    const points = nurbsCurve.getPoints(200);
   const geometry = new THREE.TubeGeometry(nurbsCurve, 100, 0.5, 100)
        const material = new THREE.MeshStandardMaterial({ roughness: 0, metalness: 1, color: "white" });
        nurbsLine = new THREE.Mesh(geometry, material);
        nurbsLine.position.set(0, 0, 0)
        group.add(nurbsLine);
}

function animate() {
    requestAnimationFrame(animate);
    stats.update();
    controls.update(); 
    renderer.render(scene, camera);
}
