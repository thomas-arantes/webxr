import * as THREE from './libs/three.module.js';
import { VRButton } from './libs/VRButton.js';
import { GLTFLoader } from './libs/GLTFLoader.js';
import { DRACOLoader } from './libs/DRACOLoader.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const xrRig = new THREE.Group();
xrRig.position.set(0, 0, 0);
xrRig.add(camera);
scene.add(xrRig);

const renderer = new THREE.WebGLRenderer({ antialias: true });
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
// scene.add(floor);

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
    const center = box.getCenter(new THREE.Vector3());

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
            // Mapeamentos mais comuns (Xbox):
            // axes[0], axes[1] => stick esquerdo (x, y)
            // axes[2], axes[3] => stick direito (x, y) — às vezes pode ser [2] e [5] em alguns navegadores
            const lx = dz(pad.axes[0] || 0);
            const ly = dz(pad.axes[1] || 0);
            const rx = dz(pad.axes[2] || 0);

            // === ROTAÇÃO (YAW) DO RIG via stick direito (horizontal) ===
            xrRig.rotation.y -= rx * turnSpeed * dt;

            // === MOVIMENTO NO PLANO XZ via stick esquerdo ===
            // move para frente/atrás relativo ao olhar (só yaw, ignorando pitch do headset)
            // direções baseadas no heading (yaw) atual do rig:
            const yaw = xrRig.rotation.y;
            const forwardX = -Math.sin(yaw);
            const forwardZ = -Math.cos(yaw);

            // right (lateral) correto para o sistema X à direita / Z para frente(-)
            const rightX = Math.cos(yaw);
            const rightZ = -Math.sin(yaw);

            // movimentação
            const moveX = (rightX * lx + forwardX * -ly) * moveSpeed * dt;
            const moveZ = (rightZ * lx + forwardZ * -ly) * moveSpeed * dt;

            // aplique nos eixos correspondentes (sem inverter)
            xrRig.position.x += moveX;
            xrRig.position.z += moveZ;

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

function makeVersionSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // fundo arredondado
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const r = 24;
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(w, 0, w, h, r);
    ctx.arcTo(w, h, 0, h, r);
    ctx.arcTo(0, h, 0, 0, r);
    ctx.arcTo(0, 0, w, 0, r);
    ctx.closePath();
    ctx.fill();

    // texto
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 28, h / 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);

    // tamanho em "metros" no mundo (ajuste à vontade)
    sprite.scale.set(0.30, 0.07, 1);

    // ancorar no canto inferior esquerdo da visão
    // colocar ~1m à frente e ligeiro offset para baixo/esquerda
    sprite.position.set(-0.50, -0.80, -1);

    return sprite;
}

// adicionar quando a sessão VR começar (garante que fique preso ao "headset camera")
let versionSprite;
renderer.xr.addEventListener('sessionstart', () => {
    if (!versionSprite) {
        versionSprite = makeVersionSprite('Build v0.1.0');
        camera.add(versionSprite);
    }
});