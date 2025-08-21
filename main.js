import * as THREE from './libs/three.module.js';
import { VRButton } from './libs/VRButton.js';
import { GLTFLoader } from './libs/GLTFLoader.js';
import { DRACOLoader } from './libs/DRACOLoader.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

// const light = new THREE.HemisphereLight(0xffffff, 0x444444);
// light.position.set(0, 20, 0);
// scene.add(light);

const ambientLight = new THREE.AmbientLight(0xffffff, .8);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
const pointLight = new THREE.PointLight(0xffffff, 2, 100);
pointLight.position.set(0, 20, 0);
scene.add(ambientLight);
scene.add(directionalLight);
scene.add(pointLight);

const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x808080 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('../libs/draco/gltf/');

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);
loader.load('./models/honda_fit.glb', function (gltf) {

    const model = gltf.scene;
    model.position.set(-.22, -.25, .4);
    // model.rotation.set(0.1, 0.5, 0);
    // model.scale.set(30, 30, 30);
    scene.add(model);

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());

    // animate();
}, undefined, function (e) {
    console.error(e);
});

// const cube = new THREE.Mesh(
//     new THREE.BoxGeometry(1, 1, 1),
//     new THREE.MeshStandardMaterial({ color: 0x00ff00 })
// );
// cube.position.set(0, 0.5, -2);
// scene.add(cube);

function animate() {
    renderer.setAnimationLoop(() => {
        // cube.rotation.x += 0.01;
        // cube.rotation.y += 0.01;
        renderer.render(scene, camera);
    })
};
animate();
