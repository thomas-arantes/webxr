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

const CAPSULE_HEIGHT = 1.6;     // altura total do “corpo”
const HALF = CAPSULE_HEIGHT / 2; // 0.8
const CENTER_OFFSET = HALF;      // offset do pé (rig.y) até o centro da cápsula

// HEAD-relative (olhar)
function getHeadBasis(renderer, camera) {
    const xrCam = renderer.xr.getCamera(camera);
    const head = xrCam.isArrayCamera ? xrCam.cameras[0] : xrCam;

    TMP_FWD.set(0, 0, -1).applyQuaternion(head.quaternion); // world-space
    TMP_FWD.y = 0; TMP_FWD.normalize();

    // right = up x forward (regra da mão direita)
    TMP_RIGHT.copy(TMP_FWD).cross(Y_UP).normalize();
    return { forward: TMP_FWD, right: TMP_RIGHT };
}

// RIG/body-relative (frente do “corpo” = yaw do xrRig)
function getRigBasis(xrRig) {
    const yaw = xrRig.rotation.y;
    TMP_FWD.set(0, 0, -1).applyAxisAngle(Y_UP, yaw).normalize();
    TMP_RIGHT.set(1, 0, 0).applyAxisAngle(Y_UP, yaw).normalize();
    return { forward: TMP_FWD, right: TMP_RIGHT };
}

// CONTROLLER-relative (se quiser seguir o controle direito, por exemplo)
function getControllerBasis(controller) {
    // pegue a orientação do controle; caia para o rig se não houver
    if (!controller) return getRigBasis(xrRig);
    const q = controller.quaternion ?? controller.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3())[1];
    TMP_FWD.set(0, 0, -1).applyQuaternion(q);
    TMP_FWD.y = 0; TMP_FWD.normalize();
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

const cube0 = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 2, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x00ff00 })
);

const cube1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 2, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x0000ff })
);

const cube2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 2, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xff0000 })
);

const cube3 = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 2, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xffff00 })
);

cube0.name = 'col_cube0';
cube1.name = 'col_cube1';
cube2.name = 'col_cube2';
cube3.name = 'col_cube3';

cube0.position.set(2, 2, -2);
scene.add(cube0);
cube1.position.set(3, 2, 2);
scene.add(cube1);
cube2.position.set(-2, 2, 5);
scene.add(cube2);
cube3.position.set(4, 2, 3);
scene.add(cube3);


const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('../libs/draco/gltf/');

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);
loader.load('./models/office_of_a_crane_operator.glb', function (gltf) {

    const model = gltf.scene;
    model.position.set(-5.82, 0, -3.5);
    // model.rotation.set(0.1, 0.5, 0);
    // model.scale.set(30, 30, 30);
    model.name = 'col_model';
    scene.add(model);

    collectColliders(model);

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

const moveSpeed = 2.5;
const SNAP_ANGLE = Math.PI / 6; // 30 graus
let snapCooldown = false;

const clock = new THREE.Clock();

const LOCOMOTION_FRAME = 'rig'; // 'head' | 'rig' | 'controller'

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// adicionar quando a sessão VR começar (garante que fique preso ao "headset camera")
renderer.xr.addEventListener('sessionstart', () => {
    const hud = versionSprite.makeVersionSprite(version);
    const xrC = renderer.xr.getCamera(camera);
    xrC.add(hud);
});

const colliders = [];

function collectColliders(root) {
    // console.log(root)
    root.traverse(obj => {
        // use uma convenção: só objetos com nome começando com 'col_' contam
        if (obj.name.startsWith('col_')) {
            obj.updateWorldMatrix(true, false);
            const box = new THREE.Box3().setFromObject(obj);
            colliders.push({ box, obj });
        }
    });
}

// chame isso depois que o GLTF carregar:
collectColliders(scene);
// console.log(colliders);

const player = {
    pos: new THREE.Vector3(0, 1.6, 0), // pode manter assim; o y aqui é “lógico” (centro)
    radius: 0.35,
    halfHeight: HALF
};

function playerYRange() {
    const centerY = xrRig.position.y + CENTER_OFFSET;
    return { min: centerY - HALF, max: centerY + HALF };
}

function overlap1D(a0, a1, b0, b1) {
    return (a0 <= b1) && (b0 <= a1);
}

function intersectsExpandedXZ(p, box, r) {
    const yr = playerYRange();
    if (!overlap1D(yr.min, yr.max, box.min.y, box.max.y)) return false;

    if (p.x < box.min.x - r) return false;
    if (p.x > box.max.x + r) return false;
    if (p.z < box.min.z - r) return false;
    if (p.z > box.max.z + r) return false;
    return true;
}

function moveWithCollisions(desiredDelta) {
    const next = player.pos.clone();
    const yR = playerYRange();

    // X
    if (desiredDelta.x !== 0) {
        next.x = player.pos.x + desiredDelta.x;
        let hitX = false;
        for (const { box } of colliders) {
            if (intersectsExpandedXZ(next, box, player.radius)) { hitX = true; break; }
        }
        if (!hitX) player.pos.x = next.x;
    }

    // Z  (sem next===player.pos)
    if (desiredDelta.z !== 0) {
        next.copy(player.pos);
        next.z = player.pos.z + desiredDelta.z;
        let hitZ = false;
        for (const { box } of colliders) {
            if (intersectsExpandedXZ(next, box, player.radius)) { hitZ = true; break; }
        }
        if (!hitZ) player.pos.z = next.z;
    }
}

function debugBoxes() {
    const mat = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    colliders.forEach(({ box }) => {
        const helper = new THREE.Box3Helper(box, 0x00ff00);
        scene.add(helper);
    });
}
debugBoxes();

// === INTERAÇÃO: lista de interagíveis ===
const interactables = []; // { mesh, message, panelSprite }
let currentTarget = null; // o mais próximo dentro do raio
const INTERACT_RADIUS = 1.2; // metros

function registerInteractable(mesh, message) {
    const panel = makeTextPanel(message);
    panel.visible = false;
    mesh.add(panel); // fica “acoplado” ao cubo
    panel.position.set(0, 1.2, 0); // altura acima do cubo (ajuste à vontade)
    interactables.push({ mesh, message, panelSprite: panel });
    console.log(interactables)
}

function makeTextPanel(text) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // desenha balão simples
    const PADDING = 16, MAX_W = 512;
    ctx.font = '24px sans-serif';
    const lines = wrapText(ctx, text, MAX_W - PADDING * 2);
    const lineH = 30;
    const w = Math.min(
        MAX_W,
        Math.max(...lines.map(l => ctx.measureText(l).width)) + PADDING * 2
    );
    const h = lines.length * lineH + PADDING * 2;

    canvas.width = nextPow2(w);
    canvas.height = nextPow2(h);

    // reconfigurar font após mudar size do canvas
    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#333333';

    // fundo com borda
    roundRect(ctx, 0, 0, w, h, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.stroke();

    // texto
    ctx.fillStyle = '#FFFFFF';
    let y = PADDING + 24;
    for (const line of lines) {
        ctx.fillText(line, PADDING, y);
        y += lineH;
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);

    // escala para um tamanho legível no mundo (ajuste fino conforme gosto)
    const SCALE = 0.002; // pixels -> metros
    sprite.scale.set(w * SCALE, h * SCALE, 1);

    return sprite;
}

// helpers do canvas
function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
        const test = (line ? line + ' ' : '') + w;
        if (ctx.measureText(test).width > maxWidth) {
            if (line) lines.push(line);
            line = w;
        } else {
            line = test;
        }
    }
    if (line) lines.push(line);
    return lines;
}
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}
function nextPow2(v) { let p = 1; while (p < v) p <<= 1; return p; }

registerInteractable(cube0, 'Caixa verde: instruções de segurança...');
registerInteractable(cube1, 'Caixa azul: checklist do operador...');
registerInteractable(cube2, 'Caixa vermelha: EPI obrigatório...');
registerInteractable(cube3, 'Caixa amarela: área de risco...');

function findNearestInteractable() {
    currentTarget = null;
    let bestD2 = INTERACT_RADIUS * INTERACT_RADIUS;
    const px = xrRig.position.x, pz = xrRig.position.z;

    for (const it of interactables) {
        const wp = new THREE.Vector3();
        it.mesh.getWorldPosition(wp);
        // distância no plano XZ
        const dx = wp.x - px;
        const dz = wp.z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 <= bestD2) {
            bestD2 = d2;
            currentTarget = it;
        }
    }
}

let prevBtnPressed = false;

function handleInteractionButton(pad) {
    // botão “A” (ou gatilho primário) costuma ser buttons[0] ou [1] dependendo do controle
    const b = (pad.buttons && pad.buttons[0]) ? pad.buttons[0] : null;
    const pressed = !!(b && b.pressed);

    // borda de subida
    if (pressed && !prevBtnPressed) {
        if (currentTarget) {
            console.log('Interagiu com:', currentTarget.message);
            // alterna visibilidade do painel deste alvo
            currentTarget.panelSprite.visible = !currentTarget.panelSprite.visible;
            // opcional: fechar os outros
            for (const it of interactables) {
                if (it !== currentTarget) it.panelSprite.visible = false;
            }
        }
    }

    prevBtnPressed = pressed;
}

function animate() {
    renderer.setAnimationLoop(() => {
        const dt = clock.getDelta();
        const pad = getPad();
        if (pad) {
            const lx = dz(pad.axes[0] || 0);
            const ly = dz(pad.axes[1] || 0);
            const rx = dz(pad.axes[2] || 0);

            // base de locomoção (head, rig ou controller)
            let basis;
            if (LOCOMOTION_FRAME === 'head') basis = getHeadBasis(renderer, camera);
            else if (LOCOMOTION_FRAME === 'rig') basis = getRigBasis(xrRig);
            else basis = getControllerBasis(renderer.xr.getController ? renderer.xr.getController(0) : null);

            // movimento no plano
            TMP_MOVE.set(0, 0, 0)
                .addScaledVector(basis.right, lx * moveSpeed * dt)
                .addScaledVector(basis.forward, -ly * moveSpeed * dt);
            // pos do jogador = xrRig.position (use a mesma base)
            player.pos.copy(xrRig.position);

            // TMP_MOVE é seu deslocamento desejado na horizontal
            player.pos.set(xrRig.position.x, player.pos.y, xrRig.position.z);
            moveWithCollisions(TMP_MOVE);

            // sincroniza o rig com a posição do “player”
            xrRig.position.set(player.pos.x, xrRig.position.y, player.pos.z);

            // SNAP TURN no analógico direito (rx)
            if (!snapCooldown) {
                if (rx > 0.7) {  // empurrou para a direita
                    xrRig.rotation.y -= SNAP_ANGLE;
                    snapCooldown = true;
                } else if (rx < -0.7) { // empurrou para a esquerda
                    xrRig.rotation.y += SNAP_ANGLE;
                    snapCooldown = true;
                }
            }

            // libera cooldown quando soltar o analógico
            if (snapCooldown && Math.abs(rx) < 0.2) {
                snapCooldown = false;
            }
        }
        const yr = playerYRange();
        if (Math.random() < 0.01) { // loga de vez em quando
            console.log('YR(min,max)=', yr.min.toFixed(2), yr.max.toFixed(2));
        }

        // 1) descobrir alvo mais próximo
        findNearestInteractable();

        // 2) ler botão e alternar painel quando aplicável
        if (pad) handleInteractionButton(pad);

        // 3) virar os painéis para a câmera (billboard)
        const xrC = renderer.xr.getCamera(camera);
        for (const it of interactables) {
            if (it.panelSprite.visible) {
                // faz o painel “olhar” para a câmera
                it.panelSprite.quaternion.copy(xrC.quaternion);
            }
        }
        renderer.render(scene, camera);
    });
}
animate();