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
    scene.add(model);
    model.name = 'col_model';

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

const moveSpeed = 1.5;
const SNAP_ANGLE = Math.PI / 6; // 30 graus
let snapCooldown = false;

const clock = new THREE.Clock();

const LOCOMOTION_FRAME = 'rig'; // 'head' | 'rig' | 'controller'

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
            moveWithCollisions(TMP_MOVE);

            // sincroniza o rig com a posição do “player”
            xrRig.position.copy(player.pos);

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
        if (obj.isMesh && obj.name.startsWith('col_')) {
            obj.updateWorldMatrix(true, false);
            const box = new THREE.Box3().setFromObject(obj);
            colliders.push({ box, obj });
        }
    });
}


// chame isso depois que o GLTF carregar:
collectColliders(scene);
console.log(colliders);

const player = {
    // posição do "centro" (meio da cápsula em Y)
    pos: new THREE.Vector3(0, 1.6, 0),
    radius: 0.35,   // raio do “corpo” em XZ
    halfHeight: 0.8 // metade da altura (capsule total ~1.6m)
};

// ajuda: faixa vertical da cápsula
function playerYRange() {
    return { min: player.pos.y - player.halfHeight, max: player.pos.y + player.halfHeight };
}

function overlap1D(a0, a1, b0, b1) {
    return (a0 <= b1) && (b0 <= a1);
}

function intersectsExprandedXZ(p, box, r) {
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

    // 4.1 — tentar mover no X
    if (desiredDelta.x !== 0) {
        next.x = player.pos.x + desiredDelta.x;

        // se colidir com QUALQUER caixa expandida, cancela X
        for (const { box } of colliders) {
            if (intersectsExpandedXZ(next, box, player.radius)) {
                // opcional: tente "encostar" recalculando o máximo deslocamento sem penetrar
                // simples: zerar X para evitar penetração
                next.x = player.pos.x;
                break;
            }
        }
    }

    // 4.2 — tentar mover no Z
    if (desiredDelta.z !== 0) {
        next.z = (next === player.pos) ? player.pos.z + desiredDelta.z : next.z + desiredDelta.z;

        for (const { box } of colliders) {
            if (intersectsExpandedXZ(next, box, player.radius)) {
                next.z = (next === player.pos) ? player.pos.z : next.z - desiredDelta.z; // volta Z
                break;
            }
        }
    }

    // 4.3 — aplicar resultado
    player.pos.copy(next);
}