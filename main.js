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

// HEAD-relative (olhar)
function getHeadBasis(renderer, camera) {
    const xrCam = renderer.xr.getCamera(camera);
    const head = xrCam.isArrayCamera ? xrCam.cameras[0] : xrCam;

    TMP_FWD.set(0, 0, -1).applyQuaternion(head.quaternion);
    TMP_FWD.y = 0; TMP_FWD.normalize();

    // right = forward × up  (RH, Y-up)
    TMP_RIGHT.copy(TMP_FWD).cross(Y_UP).normalize();
    return { forward: TMP_FWD, right: TMP_RIGHT };
}

function getRigBasis(xrRig) {
    const yaw = xrRig.rotation.y;
    TMP_FWD.set(0, 0, -1).applyAxisAngle(Y_UP, yaw).normalize();
    TMP_RIGHT.copy(TMP_FWD).cross(Y_UP).normalize();
    return { forward: TMP_FWD, right: TMP_RIGHT };
}

function getControllerBasis(controller) {
    if (!controller) return getRigBasis(xrRig);
    const q = controller.quaternion ?? controller.matrixWorld.decompose(
        new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3()
    )[1];

    TMP_FWD.set(0, 0, -1).applyQuaternion(q);
    TMP_FWD.y = 0; TMP_FWD.normalize();

    // right = forward × up
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

// Snap-turn ON (único modo)
const SNAP_DEGREES = 45;       // tamanho do salto (30/45/60)
const SNAP_THRESHOLD = 0.75;   // quanto empurrar o RX para disparar
const SNAP_COOLDOWN = 0.25;    // segundos entre giros
let snapCooldown = 0;

const clock = new THREE.Clock();

const LOCOMOTION_FRAME = 'rig'; // 'head' | 'rig' | 'controller'

function animate() {
    renderer.setAnimationLoop(() => {
        const dt = clock.getDelta();
        snapCooldown -= dt;

        const pad = getPad();
        if (pad) {
            // Analógicos
            const lx = dz(pad.axes[0] || 0);
            const ly = dz(pad.axes[1] || 0);
            const rx = dz(pad.axes[2] || 0); // eixo X do stick direito

            // ---------- SNAP-TURN (sem smooth) ----------
            if (snapCooldown <= 0) {
                if (rx > SNAP_THRESHOLD) {
                    xrRig.rotation.y -= THREE.MathUtils.degToRad(SNAP_DEGREES);
                    snapCooldown = SNAP_COOLDOWN;
                } else if (rx < -SNAP_THRESHOLD) {
                    xrRig.rotation.y += THREE.MathUtils.degToRad(SNAP_DEGREES);
                    snapCooldown = SNAP_COOLDOWN;
                }
            }

            // ---------- Movimento (plano XZ) ----------
            let basis;
            if (LOCOMOTION_FRAME === 'head') basis = getHeadBasis(renderer, camera);
            else if (LOCOMOTION_FRAME === 'rig') basis = getRigBasis(xrRig);
            else basis = getControllerBasis(renderer.xr.getController ? renderer.xr.getController(0) : null);

            TMP_MOVE.set(0, 0, 0)
                .addScaledVector(basis.right, lx * moveSpeed * dt)
                .addScaledVector(basis.forward, -ly * moveSpeed * dt); // inverta o sinal se preferir
            xrRig.position.add(TMP_MOVE);
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
let versionOnScreen;
console.log(makeVersionSprite);
renderer.xr.addEventListener('sessionstart', () => {
    const xrCam = renderer.xr.getCamera(camera); // re-obter após iniciar a sessão
    versionOnScreen = versionSprite.makeVersionSprite(version);
    xrCam.add(versionOnScreen);
});