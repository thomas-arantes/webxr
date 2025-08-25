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
scene.add(floor);

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('../libs/draco/gltf/');

const PLAYER_RADIUS = 0.30;          // “raio” do jogador (em metros)
const CHECK_HEIGHTS = [0.5, 1.2];    // alturas (joelho, peito) pra raycast
const raycaster = new THREE.Raycaster();
const tmpV = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const normalMatrix = new THREE.Matrix3();

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

    model.traverse((o) => {
        if (o.isMesh) {
            // opcional: use naming p/ filtrar só geometrias grandes
            // if (!/^col_/i.test(o.name)) return;
            o.updateMatrixWorld(true);
            colliders.push(o);
        }
    });

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

function applyCollision(rig, delta /* Vector3 */) {
    // se o movimento é muito pequeno, só aplica
    if (delta.lengthSq() < 1e-9) {
        rig.position.add(delta);
        return;
    }

    // direção e distância desse passo
    const dir = tmpV.copy(delta).setY(0);
    const dist = dir.length();
    if (dist === 0) { rig.position.add(delta); return; }
    dir.normalize();

    let blocked = false;
    let bestHit = null;

    for (const h of CHECK_HEIGHTS) {
        // origem dos raios em duas alturas
        const origin = tmpV.set(rig.position.x, rig.position.y + h, rig.position.z);

        // “far” inclui o passo + o raio do jogador — bate “antes” da parede
        raycaster.set(origin, dir);
        raycaster.far = PLAYER_RADIUS + dist + 0.02; // 2cm de folga

        const hits = raycaster.intersectObjects(colliders, true);
        if (hits.length) {
            const hit = hits[0];
            // bateu “antes” de terminar o passo?
            if (hit.distance < PLAYER_RADIUS + dist) {
                blocked = true;
                // guarda o mais próximo para normal mais confiável
                if (!bestHit || hit.distance < bestHit.distance) bestHit = hit;
            }
        }
    }

    if (!blocked) {
        // livre: aplica o delta normalmente
        rig.position.add(delta);
        return;
    }

    // BLOQUEADO: deslizar no plano da superfície
    // normal em espaço de mundo
    tmpN.copy(bestHit.face.normal);
    normalMatrix.getNormalMatrix(bestHit.object.matrixWorld);
    tmpN.applyMatrix3(normalMatrix).normalize();

    // projeta o delta no plano perpendicular à normal (efeito “slide”)
    const slide = tmpV.copy(delta).projectOnPlane(tmpN);

    // Se o slide ficou muito pequeno, evita jitter
    if (slide.lengthSq() > 1e-8) {
        rig.position.add(slide);
        // pequeno afastamento contrário à normal para não “colar” na parede
        rig.position.addScaledVector(tmpN, 0.002);
    }
    // senão, fica parado nesse frame
}

function animate() {
    renderer.setAnimationLoop(() => {
        const dt = clock.getDelta();

        const pad = getPad();
        if (pad) {
            const lx = dz(pad.axes[0] || 0);
            const ly = dz(pad.axes[1] || 0);
            const rx = dz(pad.axes[2] || 0);

            xrRig.rotation.y -= rx * turnSpeed * dt;

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

            // AQUI: usamos o anti-penetração em vez de mover direto
            const deltaMove = tmpV.set(moveX, 0, moveZ);
            applyCollision(xrRig, deltaMove);
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

renderer.xr.setReferenceSpaceType('local-floor');
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));