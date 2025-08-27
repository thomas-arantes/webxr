import * as THREE from './libs/three.module.js';
import { VRButton } from './libs/VRButton.js';
import { GLTFLoader } from './libs/GLTFLoader.js';
import { DRACOLoader } from './libs/DRACOLoader.js';
import { versionSprite } from './version_sprite.js';

let version = 'Build v0.0.1';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);

// helpers no topo do arquivo (opcional para reaproveitar vetores)
const Y_UP = new THREE.Vector3(0, 1, 0);
const TMP_FWD = new THREE.Vector3();
const TMP_RIGHT = new THREE.Vector3();
const TMP_MOVE = new THREE.Vector3();

function getHeadBasis(renderer, camera) {
    // Em XR, three.js devolve uma ArrayCamera; pegue a primeira câmera (HMD)
    // const xrCam = renderer.xr.getCamera(camera);
    const head = xrCam.isArrayCamera ? xrCam.cameras[0] : xrCam;

    // forward do HMD = -Z no espaço do head, projetado no plano XZ
    TMP_FWD.set(0, 0, -1).applyQuaternion(head.quaternion);
    TMP_FWD.y = 0;
    TMP_FWD.normalize();

    // right = forward x up (resulta em +X como "direita")
    TMP_RIGHT.copy(TMP_FWD).cross(Y_UP).normalize();

    return { forward: TMP_FWD, right: TMP_RIGHT };
}

const renderer = new THREE.WebGLRenderer({ antialias: true });

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const xrCam = renderer.xr.getCamera(camera);
camera.position.set(4, 1.6, 15);
camera.rotation.set(0, .4, 0);
const xrRig = new THREE.Group();
xrRig.position.set(0, 0, 0);
xrRig.add(camera);
scene.add(xrRig);

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

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
loader.load('./models/office_of_a_crane_operator.glb', function (gltf) {

    const model = gltf.scene;
    model.position.set(-.22, -.2, 1.5);
    // model.rotation.set(0.1, 0.5, 0);
    // model.scale.set(30, 30, 30);
    scene.add(model);

    const box = new THREE.Box3().setFromObject(model);

}, undefined, function (e) {
    console.error(e);
});

let gamepadIndex = null;

// em muitos navegadores móveis, pressionar um botão “acorda” o Gamepad API
window.addEventListener('gamepadconnected', (e) => {
    gamepadIndex = e.gamepad.index;
    console.log('Controle conectado:', e.gamepad.id);
});
window.addEventListener('gamepaddisconnected', () => {
    gamepadIndex = null;
    console.log('Controle desconectado');
});

function getPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (gamepadIndex != null && pads[gamepadIndex]) {
        return pads[gamepadIndex];
    }
    for (const p of pads) if (p) return p;
    return null;
}

// deadzone para os analogicos 
function dz(v, d = .15) {
    return Math.abs(v) < d ? 0 : (v > 0 ? (v - d) / (1 - d) : (v + d) / (1 - d));
}

const moveSpeed = 1.5;
const turnSpeed = Math.PI;

const clock = new THREE.Clock();


function animate() {
    renderer.setAnimationLoop(() => {
        const dt = clock.getDelta();

        const pad = getPad();
        if (pad) {
            const lx = dz(pad.axes[0] || 0);
            const ly = dz(pad.axes[1] || 0);
            const rx = dz(pad.axes[2] || 0);

            // Rotação artificial (smooth-turn) do rig com o stick direito (opcional)
            // xrRig.rotation.y -= rx * turnSpeed * dt;

            // >>> MOVIMENTO RELATIVO AO HEADSET (NÃO AO RIG) <<<
            const { forward, right } = getHeadBasis(renderer, camera);

            TMP_MOVE.set(0, 0, 0)
                .addScaledVector(right, lx * moveSpeed * dt)   // strafe
                .addScaledVector(forward, -ly * moveSpeed * dt); // frente/tras

            xrRig.position.add(TMP_MOVE);

            // Exemplo: botão A (0) para "interagir"/click (útil para um gaze cursor)
            if (pad.buttons[0] && pad.buttons[0].pressed) {
                // dispare sua lógica de interação aqui
                // ex.: raycast a partir do centro da tela
            }
        }
        renderer.render(scene, camera);
    });
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});



// adicionar quando a sessão VR começar (garante que fique preso ao "headset camera")
// let versionSprite;
renderer.xr.addEventListener('sessionstart', () => {
    if (!versionSprite) {
        versionSprite = makeVersionSprite(version);
        xrCam.add(versionSprite);
    }
});