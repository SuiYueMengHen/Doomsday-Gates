import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SFX } from './audio.js';
import { CrowdRenderer, soldierParts, zombieParts, infectedSoldierParts } from './crowd.js';
import { UPGRADE_DEFS, addSquad, formatNumber, loadMeta, saveMeta, upgradeCost } from './meta.js';
import {
  ACHIEVEMENTS, ARMORY_ITEMS, BASE_BUILDINGS, BIOMES, CHAPTERS, CLASSES, FORMATIONS,
  PERKS, RELICS, SIDE_BOSSES, SPECIAL_GATES, STORY_EVENTS, TERRAIN, VEHICLES, WEATHER,
  dailySeed, pickWithSeed,
} from './content.js';

// ============================================================ 常量
const ROAD_W = 11;
const SQUAD_X_LIMIT = 3.4;
const MAX_SOLDIER_RENDER = 140;
const MAX_ZOMBIE_RENDER = 500;      // 允许僵尸铺满整个屏幕
const MAX_BULLETS = 700;
const MAX_SQUAD_RADIUS = 2.3;
const BASE_SPACING = 0.62;
const MAX_SHOOTERS = 50;
const GATE_W = 4.6;
const GATE_H = 3.4;
const CHUNK_LEN = 120;              // 环境按块无限生成

// 无尽模式节奏（单位：世界距离）
const GATE_SPACING = 55;            // 门的间隔（比之前稀疏）
const PICKUP_SPACING = 110;         // 道具箱平均间隔
const WAVE_SPACING = 26;
const FIRST_BOSS_AT = 320;
const BOSS_INTERVAL = 420;

// 难度系数：随跑过的距离无限增长
const diffAt = (dist) => 1 + dist / 140;

// ============================================================ 武器表
const WEAPONS = {
  rifle:   { name: '步枪',   kind: 'tracer', rate: 2.6,  dmg: 1,   speed: 44, color: 0xffe27a, pellets: 1, spread: 0,    aoe: 0,   size: 1 },
  shotgun: { name: '霰弹枪', kind: 'tracer', rate: 1.6,  dmg: 1,   speed: 40, color: 0xffa94a, pellets: 3, spread: 0.42, aoe: 0,   size: 1.25 },
  minigun: { name: '加特林', kind: 'tracer', rate: 5.2,  dmg: 0.6, speed: 52, color: 0x9fffd0, pellets: 1, spread: 0.12, aoe: 0,   size: 0.75 },
  rocket:  { name: '火箭筒', kind: 'rocket', rate: 0.8,  dmg: 5,   speed: 28, color: 0xff6a3a, pellets: 1, spread: 0,    aoe: 2.2, size: 1 },
  tesla:   { name: '电击器', kind: 'zap',    rate: 0.75, dmg: 3.2, speed: 0,  color: 0x7ae4ff, pellets: 1, spread: 0,    aoe: 0,   size: 1 },
  flamer:  { name: '喷火器', kind: 'flame',  rate: 5.5,  dmg: 0.4, speed: 21, color: 0xff9a3a, pellets: 2, spread: 0.4, aoe: 0.8, size: 1, range: 22 },
};
const WEAPON_KEYS = Object.keys(WEAPONS);

// ============================================================ 道具表
const ITEMS = {
  medkit: { icon: '➕', name: '增援',  color: 0x3ddc84 },
  rage:   { icon: '🔥', name: '狂暴',  color: 0xff7a3a },
  shield: { icon: '🛡️', name: '护盾', color: 0x58baff },
  laser:  { icon: '🔆', name: '全屏激光', color: 0xff4a6a },
  freeze: { icon: '❄️', name: '冰冻', color: 0x9adfff },
  nuke:   { icon: '☢️', name: '核弹', color: 0xffd24a },
};

// ============================================================ 基础三件套
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b10);
scene.fog = new THREE.Fog(0x0b1017, 42, 125);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 300);

const hemi = new THREE.HemisphereLight(0x7ea9c7, 0x321b14, 0.72);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffc17c, 2.35);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -18; sun.shadow.camera.right = 18;
sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25;
sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0x4b8fc4, 1.1);
rim.position.set(-10, 8, -18);
scene.add(rim, rim.target);

const weatherPositions = new Float32Array(180 * 3);
for (let i = 0; i < 180; i++) {
  weatherPositions[i * 3] = (Math.random() - 0.5) * 24;
  weatherPositions[i * 3 + 1] = Math.random() * 12;
  weatherPositions[i * 3 + 2] = (Math.random() - 0.5) * 45;
}
const weatherGeo = new THREE.BufferGeometry();
weatherGeo.setAttribute('position', new THREE.BufferAttribute(weatherPositions, 3));
const weatherMat = new THREE.PointsMaterial({ color: 0x8abbd0, size: 0.07, transparent: true, opacity: 0.55 });
const weatherMesh = new THREE.Points(weatherGeo, weatherMat);
weatherMesh.visible = false;
scene.add(weatherMesh);

const mobileViewport = { width: window.innerWidth, height: window.innerHeight, portrait: window.innerHeight > window.innerWidth };
function syncViewport() {
  const viewport = window.visualViewport;
  mobileViewport.width = Math.max(1, Math.round(viewport?.width || window.innerWidth));
  mobileViewport.height = Math.max(1, Math.round(viewport?.height || window.innerHeight));
  mobileViewport.portrait = mobileViewport.height > mobileViewport.width;
  document.documentElement.style.setProperty('--app-height', `${mobileViewport.height}px`);
  document.documentElement.dataset.orientation = mobileViewport.portrait ? 'portrait' : 'landscape';
  camera.aspect = mobileViewport.width / mobileViewport.height;
  camera.fov = mobileViewport.portrait ? 72 : 55;
  camera.updateProjectionMatrix();
  renderer.setSize(mobileViewport.width, mobileViewport.height, false);
}
let viewportFrame = 0;
function scheduleViewportSync() {
  cancelAnimationFrame(viewportFrame);
  viewportFrame = requestAnimationFrame(syncViewport);
}
window.addEventListener('resize', scheduleViewportSync, { passive: true });
window.addEventListener('orientationchange', scheduleViewportSync, { passive: true });
window.visualViewport?.addEventListener('resize', scheduleViewportSync, { passive: true });
syncViewport();

// ============================================================ 环境：按块无限生成
function makeRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#282d32'); grad.addColorStop(.5, '#353a3f'); grad.addColorStop(1, '#282d32');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 512);
  g.fillStyle = 'rgba(255,255,255,.06)';
  for (let i = 0; i < 220; i++) {
    const s = 1 + Math.random() * 3;
    g.fillRect(Math.random() * 256, Math.random() * 512, s, s);
  }
  g.strokeStyle = '#64645b'; g.lineWidth = 5;
  g.setLineDash([34, 28]);
  g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 512); g.stroke();
  g.setLineDash([]);
  g.strokeStyle = '#a17b52'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(9, 0); g.lineTo(9, 512); g.moveTo(247, 0); g.lineTo(247, 512); g.stroke();
  g.strokeStyle = 'rgba(10,12,14,.62)'; g.lineWidth = 2;
  for (let i = 0; i < 18; i++) {
    const x = 18 + Math.random() * 220, y = Math.random() * 512;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - .5) * 28, y + 12 + Math.random() * 32); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const roadTex = makeRoadTexture();
roadTex.repeat.set(1, CHUNK_LEN / 14);
const roadGeo = new THREE.PlaneGeometry(ROAD_W, CHUNK_LEN);
const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.92, metalness: 0.04 });
const dirtGeo = new THREE.PlaneGeometry(140, CHUNK_LEN);
const dirtMat = new THREE.MeshStandardMaterial({ color: 0x171515, roughness: 1 });
const bldGeo = new THREE.BoxGeometry(1, 1, 1);
const bldMats = [0x20272d, 0x272b31, 0x1b2228, 0x302b2b].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.82, metalness: 0.12 })
);
const winMat = new THREE.MeshStandardMaterial({ color: 0xffae5c, emissive: 0xff6a24, emissiveIntensity: 2.2, roughness: 0.28 });
const propMat = new THREE.MeshStandardMaterial({ color: 0x6b4a35, roughness: 0.9 });
const barrelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.9, 10);
const barrelMat = new THREE.MeshStandardMaterial({ color: 0x9c3b2e, roughness: 0.7 });
const poleGeo = new THREE.CylinderGeometry(0.055, 0.075, 3.5, 8);
const poleMat = new THREE.MeshStandardMaterial({ color: 0x252c31, metalness: 0.75, roughness: 0.35 });
const lampGeo = new THREE.BoxGeometry(0.34, 0.12, 0.18);
const lampMat = new THREE.MeshStandardMaterial({ color: 0xffc784, emissive: 0xff7b24, emissiveIntensity: 2.8 });

let chunks = [];   // { z0, group }
let nextChunkZ = 60;

function spawnChunk(z0) {
  const group = new THREE.Group();

  const road = new THREE.Mesh(roadGeo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, z0 - CHUNK_LEN / 2);
  road.receiveShadow = true;
  group.add(road);

  const dirt = new THREE.Mesh(dirtGeo, dirtMat);
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.set(0, -0.05, z0 - CHUNK_LEN / 2);
  group.add(dirt);

  for (let z = z0; z > z0 - CHUNK_LEN; z -= 9) {
    for (const side of [-1, 1]) {
      if (Math.random() < 0.18) continue;
      const w = 5 + Math.random() * 6;
      const h = 4 + Math.random() * 14;
      const d = 6 + Math.random() * 4;
      const b = new THREE.Mesh(bldGeo, bldMats[(Math.random() * bldMats.length) | 0]);
      b.scale.set(w, h, d);
      b.position.set(side * (ROAD_W / 2 + 4 + w / 2 + Math.random() * 5), h / 2, z);
      b.castShadow = true;
      b.receiveShadow = true;
      group.add(b);
      const roof = new THREE.Mesh(bldGeo, bldMats[(Math.random() * bldMats.length) | 0]);
      roof.scale.set(w + 0.35, 0.18, d + 0.35);
      roof.position.set(b.position.x, h + 0.09, z);
      group.add(roof);
      if (Math.random() < 0.72) {
        const rows = Math.min(4, Math.max(1, Math.floor(h / 3.2)));
        for (let row = 0; row < rows; row++) {
          if (Math.random() < 0.28) continue;
          const win = new THREE.Mesh(bldGeo, winMat);
          win.scale.set(0.48, 0.62, 0.08);
          win.position.set(
            b.position.x - side * (w / 2 + 0.045),
            1.35 + row * 2.5,
            z + (Math.random() - 0.5) * d * 0.55
          );
          group.add(win);
        }
      }
    }
  }

  for (let i = 0; i < CHUNK_LEN / 12; i++) {
    const z = z0 - Math.random() * CHUNK_LEN;
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side * (ROAD_W / 2 - 0.8 - Math.random() * 0.8);
    let p;
    if (Math.random() < 0.5) {
      p = new THREE.Mesh(barrelGeo, barrelMat);
      p.position.set(x, 0.45, z);
    } else {
      p = new THREE.Mesh(bldGeo, propMat);
      p.scale.set(0.9, 0.6, 0.7);
      p.position.set(x, 0.3, z);
      p.rotation.y = Math.random() * Math.PI;
    }
    p.castShadow = true;
    group.add(p);
  }

  // 交错路灯强化道路透视，同时保持每个区块的几何量可控。
  for (let z = z0 - 8; z > z0 - CHUNK_LEN; z -= 20) {
    const side = ((Math.abs(Math.floor(z / 20)) % 2) * 2 - 1);
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(side * (ROAD_W / 2 + 0.9), 1.75, z);
    pole.castShadow = true;
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(side * (ROAD_W / 2 + 0.72), 3.45, z);
    group.add(pole, lamp);
  }

  scene.add(group);
  chunks.push({ z0, group });
}

function updateChunks() {
  while (nextChunkZ > squad.z - 320) {
    spawnChunk(nextChunkZ);
    nextChunkZ -= CHUNK_LEN;
  }
  for (let i = chunks.length - 1; i >= 0; i--) {
    if (chunks[i].z0 - CHUNK_LEN > squad.z + 90) {
      scene.remove(chunks[i].group);
      chunks.splice(i, 1);
    }
  }
}

function resetChunks() {
  for (const c of chunks) scene.remove(c.group);
  chunks = [];
  nextChunkZ = 60;
}

// ============================================================ 门
const gateGroup = new THREE.Group();
scene.add(gateGroup);

function gateLabel(gate) {
  if (gate.op === 'weapon') return WEAPONS[gate.value].name;
  if (gate.op === 'special') return SPECIAL_GATES[gate.value].name;
  if (gate.op === 'mul') return `×${gate.value}`;
  if (gate.op === 'div') return `÷${gate.value}`;
  return gate.value >= 0 ? `+${gate.value}` : `−${Math.abs(gate.value)}`;
}
function gateIsGood(gate) {
  if (gate.op === 'weapon' || gate.op === 'special' || gate.op === 'mul') return true;
  if (gate.op === 'div') return false;
  return gate.value >= 0;
}

function drawGateCanvas(gate) {
  const g = gate.ctx;
  g.clearRect(0, 0, 256, 192);
  const grad = g.createLinearGradient(0, 0, 0, 192);
  const activated = gate.op === 'weapon' && gate.remaining <= 0;
  if (activated) {
    grad.addColorStop(0, 'rgba(90,220,120,.95)'); grad.addColorStop(1, 'rgba(20,140,60,.95)');
  } else if (gate.op === 'weapon') {
    grad.addColorStop(0, 'rgba(255,205,80,.94)'); grad.addColorStop(1, 'rgba(200,120,10,.94)');
  } else if (gateIsGood(gate)) {
    grad.addColorStop(0, 'rgba(70,160,255,.92)'); grad.addColorStop(1, 'rgba(20,80,190,.92)');
  } else {
    grad.addColorStop(0, 'rgba(255,90,90,.92)'); grad.addColorStop(1, 'rgba(170,20,40,.92)');
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 192);
  g.strokeStyle = 'rgba(255,255,255,.7)';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 248, 184);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,.5)';
  g.shadowBlur = 10;
  if (gate.op === 'special') {
    g.font = '900 38px Arial, sans-serif';
    g.fillText(SPECIAL_GATES[gate.value].name, 128, 76);
    g.font = '700 20px Arial, sans-serif';
    g.fillText('特殊协议', 128, 142);
  } else if (gate.op === 'weapon') {
    const w = WEAPONS[gate.value];
    if (activated) {
      g.font = '900 46px Arial, sans-serif';
      g.fillText(w.name, 128, 70);
      g.font = '900 36px Arial, sans-serif';
      g.fillText('已装备!', 128, 136);
    } else {
      // 大倒计数：打到 0 直接激活
      g.font = '900 88px Arial, sans-serif';
      g.fillText(String(gate.remaining), 128, 74);
      g.font = '800 30px Arial, sans-serif';
      g.fillText(w.name, 128, 150);
    }
  } else {
    g.font = '900 84px Arial, sans-serif';
    g.fillText(gateLabel(gate), 128, 88);
    if (gate.upgradable && gate.value < 15) {
      g.shadowBlur = 0;
      g.font = '700 22px Arial, sans-serif';
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.fillText('射击可升级 ▲', 128, 166);
    }
  }
  gate.tex.needsUpdate = true;
  if (activated) {
    gate.frameMat.color.set(0xbfffc8); gate.frameMat.emissive.set(0x22bb44);
  } else if (gate.op === 'weapon') {
    gate.frameMat.color.set(0xffe2a0); gate.frameMat.emissive.set(0xcc8800);
  } else if (gateIsGood(gate)) {
    gate.frameMat.color.set(0x9fd4ff); gate.frameMat.emissive.set(0x1e6fe0);
  } else {
    gate.frameMat.color.set(0xffb0a0); gate.frameMat.emissive.set(0xd03030);
  }
}

function createGate(x, z, op, value, need = 0) {
  // 只有初始为负的数字门可以被子弹打回正数；增益门不可强化
  const gate = { x, z, op, value, hits: 0, remaining: need, upgradable: op === 'add' && value < 0 };
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 192;
  gate.ctx = canvas.getContext('2d');
  gate.tex = new THREE.CanvasTexture(canvas);
  gate.tex.colorSpace = THREE.SRGBColorSpace;

  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(GATE_W, GATE_H),
    new THREE.MeshBasicMaterial({ map: gate.tex, transparent: true, side: THREE.DoubleSide, depthWrite: false })
  );
  panel.position.y = GATE_H / 2 + 0.1;
  group.add(panel);

  gate.frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x000000, emissiveIntensity: 0.7, roughness: 0.4 });
  const pillarGeo = new THREE.BoxGeometry(0.28, GATE_H + 0.5, 0.28);
  const pl = new THREE.Mesh(pillarGeo, gate.frameMat);
  pl.position.set(-GATE_W / 2 - 0.14, (GATE_H + 0.5) / 2, 0);
  const pr = pl.clone();
  pr.position.x = GATE_W / 2 + 0.14;
  const top = new THREE.Mesh(new THREE.BoxGeometry(GATE_W + 0.84, 0.28, 0.28), gate.frameMat);
  top.position.y = GATE_H + 0.6;
  group.add(pl, pr, top);

  gate.group = group;
  drawGateCanvas(gate);
  gateGroup.add(group);
  return gate;
}

function applyGate(gate, count) {
  if (gate.op === 'mul') return addSquad(0, count * gate.value);
  if (gate.op === 'div') return Math.floor(count / gate.value);
  return addSquad(count, gate.value);
}

function fuseCurrentWeapon() {
  const key = state.weapon;
  state.weaponCopies[key] = (state.weaponCopies[key] || 0) + 1;
  if (state.weaponCopies[key] >= 2 && state.weaponTier < 5) {
    state.weaponCopies[key] = 0;
    state.weaponTier++;
    showBanner(`${WEAPONS[key].name} 融合至 Mk.${state.weaponTier}`);
  }
  ui.weaponTag.textContent = `${WEAPONS[key].name} · Mk.${state.weaponTier}`;
}

function applySpecialGate(key) {
  if (key === 'gamble') {
    state.count = Math.random() < 0.5 ? addSquad(state.count, state.count) : addSquad(state.count, -state.count * 0.3);
  } else if (key === 'clone') {
    fuseCurrentWeapon();
  } else if (key === 'sacrifice') {
    state.count = addSquad(state.count, -state.count * 0.15);
    state.runMods.damage += 0.28;
  } else if (key === 'time') {
    state.freezeTime = Math.max(state.freezeTime, 8);
    state.coinRushTime = Math.max(state.coinRushTime, 10);
  }
  showBanner(SPECIAL_GATES[key].name);
}

function rngPick(arr) { return arr[(Math.random() * arr.length) | 0]; }

function makeGatePair(z) {
  const half = ROAD_W / 4 + 0.35;
  const diff = diffAt(-z);
  const budget = Math.round(6 + diff * 4);
  const combos = [
    () => [{ op: 'mul', value: 2 }, { op: 'add', value: -Math.round(budget * 1.2) }],
    () => [{ op: 'mul', value: rngPick([2, 3]) }, { op: 'div', value: 2 }],
    () => [{ op: 'add', value: Math.round(budget * 1.5) }, { op: 'add', value: Math.round(budget * 0.4) }],
    () => [{ op: 'add', value: Math.round(budget) }, { op: 'add', value: -Math.round(budget) }],
    () => [{ op: 'div', value: 2 }, { op: 'add', value: -Math.round(budget * 0.8) }],
    () => [{ op: 'add', value: Math.round(budget * 2) }, { op: 'mul', value: 2 }],
  ];
  let [ca, cb] = rngPick(combos)();
  // 一定概率换成武器门：倒计数随难度增长
  if (-z > 60 && Math.random() < 0.3) {
    const others = WEAPON_KEYS.filter((k) => k !== state.weapon);
    ca = { op: 'weapon', value: rngPick(others), need: Math.round(6 + diff * 3.5) };
  }
  if (-z > 280 && Math.random() < 0.14) {
    ca = { op: 'special', value: rngPick(Object.keys(SPECIAL_GATES)) };
  }
  if (Math.random() < 0.5) [ca, cb] = [cb, ca];
  const a = createGate(-half, z, ca.op, ca.value, ca.need ?? 0);
  const b = createGate(half, z, cb.op, cb.value, cb.need ?? 0);
  gates.push({ a, b, consumed: false, z });
}

function removeGatePair(pair) {
  gateGroup.remove(pair.a.group);
  gateGroup.remove(pair.b.group);
}

// ============================================================ 道具箱
const pickupGroup = new THREE.Group();
scene.add(pickupGroup);
let pickups = [];

function createPickup(x, z, type) {
  const info = ITEMS[type];
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 1.1, 1.1),
    new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.4, emissive: info.color, emissiveIntensity: 0.25 })
  );
  crate.position.y = 0.75;
  crate.castShadow = true;
  group.add(crate);

  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '90px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(info.icon, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(1.5, 1.5, 1);
  sprite.position.y = 2.2;
  group.add(sprite);

  pickupGroup.add(group);
  pickups.push({ x, z, type, group, crate });
}

// ============================================================ 金币（实例化渲染，数量与 draw call 解耦）
const MAX_COIN_RENDER = 240;
const coinMesh = new THREE.InstancedMesh(
  new THREE.TorusGeometry(0.22, 0.075, 6, 12),
  new THREE.MeshStandardMaterial({
    color: 0xffc34e,
    emissive: 0xff8a16,
    emissiveIntensity: 1.35,
    metalness: 0.72,
    roughness: 0.28,
  }),
  MAX_COIN_RENDER
);
coinMesh.castShadow = true;
coinMesh.frustumCulled = false;
scene.add(coinMesh);
let coins = [];
const coinDummy = new THREE.Object3D();

function spawnCoinTrail(z0, sideMode = false, count = 7) {
  for (let i = 0; i < count && coins.length < MAX_COIN_RENDER; i++) {
    const t = count <= 1 ? 0 : i / (count - 1);
    coins.push({
      x: sideMode ? 0 : Math.sin(i * 1.35 + z0) * 2.55,
      y: sideMode ? 0.75 + Math.sin(t * Math.PI) * 2.25 : 0.72,
      z: z0 - i * 2.1,
      value: i === count - 1 ? 3 : 1,
    });
  }
}

function updateCoins(dt, time) {
  const magnet = 1.15 + meta.upgrades.magnet * 0.7;
  const cy = squad.y + 0.72;
  for (let i = coins.length - 1; i >= 0; i--) {
    const coin = coins[i];
    const dx = squad.x - coin.x;
    const dy = cy - coin.y;
    const dz = squad.z - coin.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < magnet) {
      const pull = Math.min(1, dt * (5 + magnet));
      coin.x += dx * pull;
      coin.y += dy * pull;
      coin.z += dz * pull;
    }
    if (distance < 0.62) {
      const weatherCoin = WEATHER[state.weatherId]?.coin || 1;
      const bonus = (1 + meta.upgrades.coinBonus * 0.1 + meta.base.vault * 0.05 + state.runMods.coin + relicBonus('coin')) * weatherCoin;
      const rush = state.coinRushTime > 0 ? 2 : 1;
      state.runCoins += Math.max(1, Math.round(coin.value * bonus * rush));
      coins.splice(i, 1);
      continue;
    }
    if (coin.z > squad.z + 16) coins.splice(i, 1);
  }

  const n = Math.min(coins.length, MAX_COIN_RENDER);
  for (let i = 0; i < n; i++) {
    const coin = coins[i];
    coinDummy.position.set(coin.x, coin.y + Math.sin(time * 5 + i) * 0.08, coin.z);
    coinDummy.rotation.set(0, time * 2.4 + i, 0);
    coinDummy.scale.setScalar(1);
    coinDummy.updateMatrix();
    coinMesh.setMatrixAt(i, coinDummy.matrix);
  }
  coinMesh.count = n;
  coinMesh.instanceMatrix.needsUpdate = true;
}

// 2D 封锁区障碍：进入侧视模式后需要跳过路障。
const obstacleGroup = new THREE.Group();
scene.add(obstacleGroup);
const obstacles = [];
const obstacleMat = new THREE.MeshStandardMaterial({ color: 0xa13c2c, roughness: 0.62, metalness: 0.2 });

function spawnSideObstacle(z) {
  const terrain = TERRAIN[obstacles.length % TERRAIN.length];
  const height = terrain === '高台' ? 1.8 : terrain === '断桥' ? 0.75 : terrain === '滑索' ? 1.05 : 1.35;
  const width = terrain === '断桥' ? 2.2 : 1.3;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.7), obstacleMat);
  mesh.position.set(0, height / 2, z);
  mesh.rotation.y = 0.12;
  mesh.castShadow = true;
  obstacleGroup.add(mesh);
  obstacles.push({ z, mesh, hit: false, terrain, height });
}

// 载具采用一个轻量组合模型，避免为短事件加载额外 GLTF。
const vehicleMesh = new THREE.Group();
const vehicleBodyMat = new THREE.MeshStandardMaterial({ color: 0xc06a2c, metalness: 0.6, roughness: 0.38 });
const vehicleDarkMat = new THREE.MeshStandardMaterial({ color: 0x151a1d, metalness: 0.72, roughness: 0.32 });
const vehicleBody = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.75, 4.2), vehicleBodyMat);
vehicleBody.position.y = 0.8;
const vehicleCab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.65), vehicleDarkMat);
vehicleCab.position.set(0, 1.45, -0.65);
const vehicleTurret = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.35, 10), vehicleDarkMat);
vehicleTurret.position.set(0, 1.9, 0.5);
vehicleMesh.add(vehicleBody, vehicleCab, vehicleTurret);
vehicleMesh.traverse((o) => { o.castShadow = true; });
vehicleMesh.visible = false;
scene.add(vehicleMesh);

function startVehicle(id) {
  const vehicle = VEHICLES[id];
  state.vehicleId = id;
  state.vehicleTime = vehicle.duration * (CLASSES[meta.classId].vehicle || 1);
  vehicleBodyMat.color.set(id === 'bike' ? 0xb47a31 : id === 'apc' ? 0x52634d : 0x8a382b);
  vehicleMesh.scale.setScalar(id === 'bike' ? 0.62 : id === 'guntruck' ? 1.15 : 1);
  vehicleMesh.visible = true;
  showBanner(`${vehicle.name} / 载具接管`);
}

function relicBonus(stat) {
  return meta.relics.reduce((sum, key) => sum + (RELICS[key]?.stat === stat ? RELICS[key].value : 0), 0);
}

function rangeMultiplier() {
  return (1 + meta.upgrades.range * 0.12 + state.runMods.range + relicBonus('range')) * CLASSES[meta.classId].range;
}

// ============================================================ 子弹（曳光弹 + 火箭弹）
const tracerCoreGeo = new THREE.CylinderGeometry(0.022, 0.05, 0.95, 6).rotateX(Math.PI / 2);
const tracerCoreMat = new THREE.MeshBasicMaterial({
  color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
});
const tracerGlowGeo = new THREE.CylinderGeometry(0.055, 0.11, 0.8, 6).rotateX(Math.PI / 2);
const tracerGlowMat = new THREE.MeshBasicMaterial({
  color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.35, depthWrite: false,
});
const tracerCoreMesh = new THREE.InstancedMesh(tracerCoreGeo, tracerCoreMat, MAX_BULLETS);
const tracerGlowMesh = new THREE.InstancedMesh(tracerGlowGeo, tracerGlowMat, MAX_BULLETS);

function makeRocketGeo() {
  const parts = [];
  parts.push(new THREE.CylinderGeometry(0.1, 0.115, 0.52, 10).rotateX(Math.PI / 2));
  parts.push(new THREE.ConeGeometry(0.1, 0.24, 10).rotateX(-Math.PI / 2).translate(0, 0, -0.38));
  for (let i = 0; i < 3; i++) {
    parts.push(new THREE.BoxGeometry(0.03, 0.22, 0.18).translate(0, 0.16, 0.2).rotateZ((i / 3) * Math.PI * 2));
  }
  return mergeGeometries(parts);
}
const ROCKET_MAX = 60;
const rocketMat = new THREE.MeshStandardMaterial({ color: 0x4a5a45, roughness: 0.5, metalness: 0.4 });
const rocketMesh = new THREE.InstancedMesh(makeRocketGeo(), rocketMat, ROCKET_MAX);
const flameGeo = new THREE.ConeGeometry(0.09, 0.5, 8).rotateX(Math.PI / 2).translate(0, 0, 0.55);
const flameMat = new THREE.MeshBasicMaterial({
  color: 0xffa040, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.9, depthWrite: false,
});
const flameMesh = new THREE.InstancedMesh(flameGeo, flameMat, ROCKET_MAX);

// 喷火器火球：随飞行膨胀消散的发光团
const FIREBALL_MAX = 200;
const fireballMesh = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.16, 8, 6),
  new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.45, depthWrite: false }),
  FIREBALL_MAX
);

for (const m of [tracerCoreMesh, tracerGlowMesh, rocketMesh, flameMesh, fireballMesh]) {
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.count * 3), 3);
  m.frustumCulled = false;
  scene.add(m);
}

// 电击器闪电链：折线池
const ZAP_POOL_N = 12;
const zapPool = [];
for (let i = 0; i < ZAP_POOL_N; i++) {
  const line = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x9aeaff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending })
  );
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  zapPool.push({ line, life: 0 });
}

function drawZapLine(points) {
  let slot = zapPool.find((z) => z.life <= 0) ?? zapPool[0];
  // 折线抖动出电弧感
  const jittered = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    jittered.push(a);
    for (const f of [0.33, 0.66]) {
      jittered.push(new THREE.Vector3(
        a.x + (b.x - a.x) * f + (Math.random() - 0.5) * 0.6,
        a.y + (b.y - a.y) * f + Math.random() * 0.5,
        a.z + (b.z - a.z) * f + (Math.random() - 0.5) * 0.6
      ));
    }
  }
  jittered.push(points[points.length - 1]);
  slot.line.geometry.setFromPoints(jittered);
  slot.line.visible = true;
  slot.life = 0.09;
}

function updateZapLines(dt) {
  for (const z of zapPool) {
    if (z.life <= 0) continue;
    z.life -= dt;
    z.line.material.opacity = Math.max(0, z.life / 0.09);
    if (z.life <= 0) z.line.visible = false;
  }
}

// 电击：从枪口锁定最近敌人，再向附近连锁跳跃；命中带麻痹减速
function fireZap(sx, sz, dmg) {
  const points = [new THREE.Vector3(sx, 0.8 + squad.y, sz)];
  const hitSet = new Set();
  let cx = sx, cz = sz;
  let range = 32 * rangeMultiplier();
  for (let hop = 0; hop < 6; hop++) {
    let best = null, bestD = range, bestBoss = null;
    for (const zb of zombies) {
      if (zb.hidden || hitSet.has(zb) || zb.z > sz) continue;
      const d = Math.hypot(zb.x - cx, zb.z - cz);
      if (d < bestD) { bestD = d; best = zb; bestBoss = null; }
    }
    // Boss 与僵尸同场竞争目标，不再只是兜底
    for (const boss of bosses) {
      if (hitSet.has(boss)) continue;
      const d = Math.hypot(boss.x - cx, boss.z - cz);
      if (d < bestD) { bestD = d; best = boss; bestBoss = boss; }
    }
    if (!best) break;
    hitSet.add(best);
    if (bestBoss) {
      bestBoss.hp -= dmg * 2.5;
      points.push(new THREE.Vector3(bestBoss.x, 2.5, bestBoss.z));
      spawnBurst(bestBoss.x, 2.5, bestBoss.z, 0x9aeaff, 6, 3, 0.25);
    } else {
      best.hp -= dmg;
      best.slowT = 0.6; // 电麻：短暂减速
      spawnBurst(best.x, 0.9, best.z, 0x9aeaff, 5, 2, 0.2);
      points.push(new THREE.Vector3(best.x, 0.9, best.z));
    }
    cx = best.x; cz = best.z;
    range = 10; // 后续跳跃距离
  }
  // 电弧也能劈门：与子弹规则一致，枪口横向对准门面板才算命中
  for (const pair of gates) {
    if (pair.consumed) continue;
    let hitGate = null;
    for (const gate of [pair.a, pair.b]) {
      if (!gateInteractive(gate)) continue;
      if (gate.z < sz && sz - gate.z < 32 * rangeMultiplier() && Math.abs(sx - gate.x) < GATE_W / 2) {
        hitGate = gate;
        break;
      }
    }
    if (hitGate) {
      hitInteractiveGate(hitGate);
      spawnBurst(hitGate.x, 1.6, hitGate.z, 0x9aeaff, 5, 2.5, 0.2);
      points.push(new THREE.Vector3(hitGate.x, GATE_H * 0.5, hitGate.z));
      break; // 每次电击最多劈一扇门
    }
  }
  if (points.length > 1) drawZapLine(points);
}

// 全屏激光：横贯道路的光墙向前推进，途经的僵尸全灭
const laserMesh = new THREE.Mesh(
  new THREE.BoxGeometry(ROAD_W + 2, 2.6, 0.35),
  new THREE.MeshBasicMaterial({ color: 0xff4a6a, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.75, depthWrite: false })
);
laserMesh.visible = false;
scene.add(laserMesh);

const bullets = [];
const _bm = new THREE.Matrix4();
const _bq = new THREE.Quaternion();
const _bs = new THREE.Vector3();
const _bp = new THREE.Vector3();
const _bc = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);

function spawnBullet(x, y, z, w, dmgScale) {
  if (bullets.length >= MAX_BULLETS) return;
  bullets.push({
    x, y, z,
    kind: w.kind,
    vx: (Math.random() - 0.5) * 2 * w.spread * w.speed * 0.12,
    speed: w.speed,
    dmg: w.dmg * dmgScale,
    aoe: w.aoe,
    size: w.size,
    color: w.color,
    trailAcc: 0,
    age: 0,
    range: (w.range ?? (w.kind === 'rocket' ? 42 : 34)) * rangeMultiplier(),
  });
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.z -= b.speed * dt;
    b.x += b.vx * dt;
    b.range -= b.speed * dt;
    if (b.kind === 'rocket' && !b.dead) {
      b.trailAcc += dt;
      if (b.trailAcc > 0.055) {
        b.trailAcc = 0;
        spawnBurst(b.x, b.y + 0.05, b.z + 0.5, 0x8a8078, 3, 0.8, 0.35);
      }
    }
    if (b.dead || b.range <= 0) bullets.splice(i, 1);
  }

  let nTracer = 0, nRocket = 0, nFire = 0;
  for (const b of bullets) {
    b.age += dt;
    const yaw = Math.atan2(b.vx, -b.speed) + Math.PI;
    _bq.setFromAxisAngle(_yAxis, yaw);
    _bp.set(b.x, b.y, b.z);
    if (b.kind === 'flame') {
      if (nFire >= FIREBALL_MAX) continue;
      // 火球随飞行膨胀，颜色由亮金渐变到深橙红
      const s = 0.5 + b.age * 2.6;
      _bs.set(s, s, s);
      _bm.compose(_bp, _bq, _bs);
      fireballMesh.setMatrixAt(nFire, _bm);
      fireballMesh.setColorAt(nFire, _bc.set(b.age < 0.15 ? 0xffe9a0 : b.age < 0.4 ? 0xffa040 : 0xe0501a));
      nFire++;
    } else if (b.kind === 'tracer') {
      if (nTracer >= MAX_BULLETS) continue;
      _bs.set(b.size, b.size, b.size);
      _bm.compose(_bp, _bq, _bs);
      tracerCoreMesh.setMatrixAt(nTracer, _bm);
      tracerGlowMesh.setMatrixAt(nTracer, _bm);
      _bc.set(b.color);
      tracerCoreMesh.setColorAt(nTracer, _bc);
      tracerGlowMesh.setColorAt(nTracer, _bc);
      nTracer++;
    } else {
      if (nRocket >= ROCKET_MAX) continue;
      _bs.set(1, 1, 1);
      _bm.compose(_bp, _bq, _bs);
      rocketMesh.setMatrixAt(nRocket, _bm);
      const f = 0.7 + Math.random() * 0.6;
      _bs.set(f, f, f * (0.8 + Math.random() * 0.5));
      _bm.compose(_bp, _bq, _bs);
      flameMesh.setMatrixAt(nRocket, _bm);
      flameMesh.setColorAt(nRocket, _bc.set(Math.random() < 0.3 ? 0xffe08a : 0xff8a3a));
      nRocket++;
    }
  }
  tracerCoreMesh.count = nTracer;
  tracerGlowMesh.count = nTracer;
  rocketMesh.count = nRocket;
  flameMesh.count = nRocket;
  fireballMesh.count = nFire;
  for (const m of [tracerCoreMesh, tracerGlowMesh, rocketMesh, flameMesh, fireballMesh]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}

// ============================================================ 敌方子弹（被感染士兵的射击）
const MAX_ENEMY_BULLETS = 80;
const enemyBulletMesh = new THREE.InstancedMesh(
  tracerCoreGeo,
  new THREE.MeshBasicMaterial({ color: 0xff5a4a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
  MAX_ENEMY_BULLETS
);
enemyBulletMesh.frustumCulled = false;
scene.add(enemyBulletMesh);
let enemyBullets = [];

function spawnEnemyBullet(x, y, z) {
  if (enemyBullets.length >= MAX_ENEMY_BULLETS) return;
  // 瞄准小队中心，带一点散布
  const T = Math.max(0.3, Math.hypot(squad.x - x, squad.z - z) / 18);
  const tx = squad.x + (Math.random() - 0.5) * 1.6;
  const tz = squad.z - squad.speed * T * 0.5;
  const len = Math.hypot(tx - x, tz - z) || 1;
  enemyBullets.push({
    x, y, z,
    vx: ((tx - x) / len) * 18,
    vz: ((tz - z) / len) * 18,
    life: 3,
  });
}

function updateEnemyBullets(dt) {
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    b.life -= dt;
    // 命中小队
    if (Math.hypot(b.x - squad.x, b.z - squad.z) < squadRadius() * 0.7 + 0.4) {
      spawnBurst(b.x, 0.7, b.z, 0xff5a4a, 8, 3, 0.3);
      loseSoldiers(1);
      enemyBullets.splice(i, 1);
      continue;
    }
    if (b.life <= 0) enemyBullets.splice(i, 1);
  }
  enemyBulletMesh.count = enemyBullets.length;
  for (let i = 0; i < enemyBullets.length; i++) {
    const b = enemyBullets[i];
    _bq.setFromAxisAngle(_yAxis, Math.atan2(-b.vx, -b.vz));
    _bp.set(b.x, b.y, b.z);
    _bs.set(0.9, 0.9, 0.9);
    _bm.compose(_bp, _bq, _bs);
    enemyBulletMesh.setMatrixAt(i, _bm);
  }
  enemyBulletMesh.instanceMatrix.needsUpdate = true;
}

// ============================================================ 兽颅投掷物（Boss / 憎恶屠夫的远程攻击）
const SKULL_MAX = 24;
const SKULL_G = 14;

function makeSkullGeo() {
  const parts = [];
  parts.push(new THREE.SphereGeometry(0.3, 10, 8));                                 // 颅骨
  parts.push(new THREE.BoxGeometry(0.3, 0.18, 0.24).translate(0, -0.16, -0.18));    // 下颚
  for (const side of [-1, 1]) {                                                     // 一对弯角
    parts.push(new THREE.ConeGeometry(0.07, 0.3, 6)
      .rotateZ(side * 0.9)
      .translate(side * 0.3, 0.18, 0));
  }
  return mergeGeometries(parts);
}
const skullMesh = new THREE.InstancedMesh(
  makeSkullGeo(),
  new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.7 }),
  SKULL_MAX
);
// 落点预警红圈
const warnRingMesh = new THREE.InstancedMesh(
  new THREE.RingGeometry(0.55, 0.8, 24).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
  SKULL_MAX
);
for (const m of [skullMesh, warnRingMesh]) {
  m.frustumCulled = false;
  scene.add(m);
}
let skulls = [];

// 从 (x,y,z) 朝小队预判落点抛出兽颅；lossFrac 决定命中时啃掉多少兵力
function throwSkull(x, y, z, lossFrac) {
  if (skulls.length >= SKULL_MAX) return;
  const T = 0.85 + Math.random() * 0.4;
  // 预判：小队会继续向前跑
  const tx = THREE.MathUtils.clamp(squad.x + (Math.random() - 0.5) * 2.5, -SQUAD_X_LIMIT, SQUAD_X_LIMIT);
  const tz = squad.z - squad.speed * T * 0.9 + (Math.random() - 0.5) * 2.5;
  skulls.push({
    x, y, z,
    vx: (tx - x) / T,
    vz: (tz - z) / T,
    vy: (0.15 - y + 0.5 * SKULL_G * T * T) / T,
    tx, tz,
    lossFrac,
    spin: Math.random() * Math.PI * 2,
    spinSpeed: 6 + Math.random() * 6,
  });
  sfx.throwSkull();
}

const _sq = new THREE.Quaternion();
const _se = new THREE.Euler();
function updateSkulls(dt, time) {
  for (let i = skulls.length - 1; i >= 0; i--) {
    const s = skulls[i];
    s.vy -= SKULL_G * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    s.spin += s.spinSpeed * dt;
    if (s.y <= 0.15 && s.vy < 0) {
      // 落地：骨屑 + 血色溅射，命中范围内啃兵
      spawnBurst(s.x, 0.4, s.z, 0xd8cfb8, 14, 4.5, 0.4);
      spawnBurst(s.x, 0.3, s.z, 0x8a1015, 8, 3, 0.5);
      sfx.skullImpact(Math.hypot(s.x - squad.x, s.z - squad.z));
      state.shake = Math.min(0.4, state.shake + 0.08);
      if (Math.hypot(s.x - squad.x, s.z - squad.z) < 2.3 + squadRadius() * 0.5) {
        loseSoldiers(Math.max(1, Math.round(state.count * s.lossFrac)));
      }
      skulls.splice(i, 1);
    }
  }

  skullMesh.count = skulls.length;
  warnRingMesh.count = skulls.length;
  for (let i = 0; i < skulls.length; i++) {
    const s = skulls[i];
    _se.set(s.spin, s.spin * 0.7, 0);
    _sq.setFromEuler(_se);
    _bp.set(s.x, s.y, s.z);
    _bs.set(1, 1, 1);
    _bm.compose(_bp, _sq, _bs);
    skullMesh.setMatrixAt(i, _bm);
    // 预警圈脉冲
    const pulse = 0.85 + Math.sin(time * 10 + i) * 0.2;
    _bp.set(s.tx, 0.03, s.tz);
    _bs.set(pulse, 1, pulse);
    _bm.compose(_bp, _sq.identity(), _bs);
    warnRingMesh.setMatrixAt(i, _bm);
  }
  skullMesh.instanceMatrix.needsUpdate = true;
  warnRingMesh.instanceMatrix.needsUpdate = true;
}

// ============================================================ Boss 技能：锤击震地波 + 地刺
// -- 震地波：从落锤点向外扩散的橙色冲击环，扫到小队即造成伤害
const SHOCK_MAX = 4;
const shockPool = [];
for (let i = 0; i < SHOCK_MAX; i++) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.0, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })
  );
  mesh.visible = false;
  scene.add(mesh);
  shockPool.push(mesh);
}
let shockwaves = [];

function spawnShockwave(x, z) {
  const mesh = shockPool.find((m) => !m.visible);
  if (!mesh) return;
  mesh.visible = true;
  mesh.position.set(x, 0.05, z);
  shockwaves.push({ x, z, r: 1.2, maxR: 15, mesh, hit: false });
  spawnBurst(x, 0.4, z, 0xb0a088, 26, 6, 0.6);
  sfx.hammer();
  state.shake = Math.min(0.6, state.shake + 0.35);
}

function updateShockwaves(dt) {
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const w = shockwaves[i];
    w.r += 11 * dt;
    w.mesh.scale.set(w.r, 1, w.r);
    w.mesh.material.opacity = 0.85 * (1 - w.r / w.maxR);
    // 冲击环扫过小队
    if (!w.hit && Math.abs(Math.hypot(squad.x - w.x, squad.z - w.z) - w.r) < 1.4) {
      w.hit = true;
      loseSoldiers(Math.max(3, Math.round(state.count * 0.12)));
    }
    if (w.r >= w.maxR) {
      w.mesh.visible = false;
      shockwaves.splice(i, 1);
    }
  }
}

// -- 地刺：红圈预警后从地下窜出的尖刺丛
const SPIKE_MAX = 9;
function makeSpikeGeo() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 1.3;
    parts.push(new THREE.ConeGeometry(0.16 + Math.random() * 0.1, 1.6 + Math.random() * 0.9, 5)
      .translate(Math.cos(a) * r, 0.8, Math.sin(a) * r));
  }
  return mergeGeometries(parts);
}
const spikePool = [];
for (let i = 0; i < SPIKE_MAX; i++) {
  const spike = new THREE.Mesh(
    makeSpikeGeo(),
    new THREE.MeshStandardMaterial({ color: 0x5a4a42, roughness: 0.6 })
  );
  spike.castShadow = true;
  spike.visible = false;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.2, 1.5, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide })
  );
  ring.visible = false;
  scene.add(spike, ring);
  spikePool.push({ spike, ring, busy: false });
}
let spikePatches = [];

function spawnSpikePatch(x, z) {
  const pool = spikePool.find((p) => !p.busy);
  if (!pool) return;
  pool.busy = true;
  pool.ring.visible = true;
  pool.ring.position.set(x, 0.04, z);
  pool.spike.position.set(x, -2.6, z);
  spikePatches.push({ x, z, pool, phase: 'warn', t: 0.85, hit: false });
}

function updateSpikePatches(dt, time) {
  for (let i = spikePatches.length - 1; i >= 0; i--) {
    const sp = spikePatches[i];
    sp.t -= dt;
    if (sp.phase === 'warn') {
      const pulse = 1 + Math.sin(time * 14) * 0.12;
      sp.pool.ring.scale.set(pulse, 1, pulse);
      if (sp.t <= 0) {
        sp.phase = 'up';
        sp.t = 0.55;
        sp.pool.ring.visible = false;
        sp.pool.spike.visible = true;
        spawnBurst(sp.x, 0.3, sp.z, 0x6a5a50, 12, 4, 0.4);
        sfx.spikes();
        if (Math.hypot(squad.x - sp.x, squad.z - sp.z) < 2.0 + squadRadius() * 0.3) {
          loseSoldiers(Math.max(2, Math.round(state.count * 0.07)));
        }
      }
    } else if (sp.phase === 'up') {
      // 破土而出 → 停留 → 缩回
      const y = sp.t > 0.4 ? THREE.MathUtils.lerp(0, -2.6, (sp.t - 0.4) / 0.15) : (sp.t > 0.15 ? 0 : THREE.MathUtils.lerp(-2.6, 0, sp.t / 0.15));
      sp.pool.spike.position.y = y;
      if (sp.t <= 0) {
        sp.pool.spike.visible = false;
        sp.pool.busy = false;
        spikePatches.splice(i, 1);
      }
    }
  }
}

// ============================================================ 粒子爆点 + 地面血泊
const bursts = [];
function spawnBurst(x, y, z, color, n = 14, speed = 5, life = 0.45) {
  if (bursts.length > 60) return;
  const pos = new Float32Array(n * 3);
  const vel = [];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    const a = Math.random() * Math.PI * 2;
    const u = Math.random() * 2 - 1;
    const s = (0.4 + Math.random() * 0.6) * speed;
    const r = Math.sqrt(1 - u * u);
    vel.push(new THREE.Vector3(Math.cos(a) * r * s, Math.abs(u) * s, Math.sin(a) * r * s));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size: 0.22, transparent: true, opacity: 1 });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  bursts.push({ points, vel, life, maxLife: life });
}

function updateBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.life -= dt;
    if (b.life <= 0) {
      scene.remove(b.points);
      b.points.geometry.dispose();
      b.points.material.dispose();
      bursts.splice(i, 1);
      continue;
    }
    const p = b.points.geometry.attributes.position;
    for (let j = 0; j < b.vel.length; j++) {
      b.vel[j].y -= 12 * dt;
      p.array[j * 3] += b.vel[j].x * dt;
      p.array[j * 3 + 1] += b.vel[j].y * dt;
      p.array[j * 3 + 2] += b.vel[j].z * dt;
    }
    p.needsUpdate = true;
    b.points.material.opacity = b.life / b.maxLife;
  }
}

// 地面血泊：击杀处留下一滩暗红渐隐污渍
const MAX_POOLS = 36;
const poolGeo = new THREE.CircleGeometry(0.55, 12);
const bloodPools = [];
function spawnBloodPool(x, z) {
  let pool;
  if (bloodPools.length >= MAX_POOLS) {
    pool = bloodPools.shift(); // 复用最旧的
  } else {
    pool = {
      mesh: new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({
        color: 0x8a1015, transparent: true, opacity: 0.75, depthWrite: false,
      })),
    };
    pool.mesh.rotation.x = -Math.PI / 2;
    scene.add(pool.mesh);
  }
  pool.life = 3.2;
  pool.mesh.visible = true;
  pool.mesh.position.set(x, 0.02 + Math.random() * 0.01, z);
  const s = 0.7 + Math.random() * 0.9;
  pool.mesh.scale.set(s, s * (0.7 + Math.random() * 0.6), 1);
  pool.mesh.rotation.z = Math.random() * Math.PI * 2;
  bloodPools.push(pool);
}

function updateBloodPools(dt) {
  for (const pool of bloodPools) {
    if (!pool.mesh.visible) continue;
    pool.life -= dt;
    if (pool.life <= 0) {
      pool.mesh.visible = false;
      continue;
    }
    pool.mesh.material.opacity = Math.min(0.75, pool.life * 0.6);
  }
}

// 击杀特效：红色血浆迸溅 + 血泊
function gore(x, z) {
  spawnBurst(x, 0.9, z, 0xc01020, 16, 6, 0.5);
  spawnBurst(x, 0.6, z, 0x7a0a12, 8, 3.5, 0.65);
  spawnBloodPool(x, z);
}

// ============================================================ 僵尸类型（致敬 CSOL 生化模式）
const ZOMBIE_TYPES = {
  // 普通僵尸：均衡，技能"暴走"——靠近时短暂提速
  normal: {
    label: '普通僵尸',
    palette: { legs: 0x3d4a2c, torso: 0x5c8a3c, head: 0x8fc46a, arms: 0x74a84e },
    hp: (d) => 1 + Math.floor(d * 1.3),
    speedMul: 1, scaleBase: 0.9, contactLoss: 1, maxRender: MAX_ZOMBIE_RENDER,
    unlockAt: 0,
  },
  // 恶魔猎手：技能"突进"——周期性猛冲
  hunter: {
    label: '恶魔猎手',
    palette: { legs: 0x5a1e1e, torso: 0x8a2a22, head: 0xc4553c, arms: 0xa03828 },
    hp: (d) => 2 + Math.floor(d * 1.1),
    speedMul: 1.15, scaleBase: 0.95, contactLoss: 1, maxRender: 150,
    unlockAt: 150,
  },
  // 憎恶屠夫：血牛肉盾，撞上一次啃掉 3 人
  butcher: {
    label: '憎恶屠夫',
    palette: { legs: 0x2c3038, torso: 0x4a525e, head: 0x9aa4b0, arms: 0x6a7480 },
    hp: (d) => 8 + Math.floor(d * 4.5),
    speedMul: 0.62, scaleBase: 1.5, contactLoss: 3, maxRender: 80,
    unlockAt: 250,
  },
  // 暗影芭比：技能"潜行"——周期性相位隐身，隐身时子弹穿过打不中
  shadow: {
    label: '暗影芭比',
    palette: { legs: 0x2a2438, torso: 0x453a5e, head: 0x8a7ab8, arms: 0x5e5080 },
    hp: (d) => 1 + Math.floor(d * 0.9),
    speedMul: 1.3, scaleBase: 0.85, contactLoss: 1, maxRender: 120,
    unlockAt: 350,
  },
  // 巫蛊术尸：技能"咒疗"——周期性治疗周围僵尸
  witch: {
    label: '巫蛊术尸',
    palette: { legs: 0x1e4038, torso: 0x2a6a58, head: 0x58c4a8, arms: 0x3a8a70 },
    hp: (d) => 2 + Math.floor(d * 1.2),
    speedMul: 0.85, scaleBase: 0.95, contactLoss: 1, maxRender: 60,
    unlockAt: 500,
  },
  // 嗜血女妖：技能"诱捕"——放出蝙蝠把小队拽向自己
  banshee: {
    label: '嗜血女妖',
    palette: { legs: 0x3a1a30, torso: 0x6a2a58, head: 0xc46aa8, arms: 0x8a3a70 },
    hp: (d) => 3 + Math.floor(d * 1.4),
    speedMul: 0.95, scaleBase: 1.0, contactLoss: 1, maxRender: 60,
    unlockAt: 650,
  },
  // 被感染的士兵：保持距离用步枪射击人类，射速低
  infected: {
    label: '被感染的士兵',
    parts: infectedSoldierParts,
    hp: (d) => 2 + Math.floor(d * 1.0),
    speedMul: 0.9, scaleBase: 0.95, contactLoss: 1, maxRender: 80,
    unlockAt: 450,
  },
};
const ZOMBIE_TYPE_KEYS = Object.keys(ZOMBIE_TYPES);

// ============================================================ 士兵 & 僵尸群渲染（每种僵尸一个实例化渲染器）
const soldierCrowd = new CrowdRenderer(scene, soldierParts(), MAX_SOLDIER_RENDER);
function applySquadCosmetic() {
  const color = meta.equippedCosmetic === 'amber' ? 0xd4953f : meta.equippedCosmetic === 'crimson' ? 0xa43c42 : 0x3e86b8;
  for (const index of [5, 10]) {
    if (soldierCrowd.meshes[index]) soldierCrowd.meshes[index].material.color.setHex(color);
  }
}
const zombieCrowds = {};
const zombieBuckets = {};
for (const key of ZOMBIE_TYPE_KEYS) {
  const t = ZOMBIE_TYPES[key];
  zombieCrowds[key] = new CrowdRenderer(scene, t.parts ? t.parts() : zombieParts(t.palette), t.maxRender);
  zombieBuckets[key] = [];
}

const unitSpiral = [];
for (let i = 0; i < MAX_SOLDIER_RENDER; i++) {
  const r = Math.sqrt(i);
  const a = i * 2.39996;
  unitSpiral.push({ dx: Math.cos(a) * r, dz: Math.sin(a) * r });
}
function formationScale(n) {
  if (n <= 1) return BASE_SPACING;
  return Math.min(BASE_SPACING, MAX_SQUAD_RADIUS / Math.sqrt(n - 1)) * FORMATIONS[meta.formationId].spread;
}
function squadRadius() {
  const n = Math.min(state.count, MAX_SOLDIER_RENDER);
  return n <= 1 ? 0.4 : formationScale(n) * Math.sqrt(n - 1) + 0.4;
}

const shieldMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0x58baff, transparent: true, opacity: 0.22, depthWrite: false })
);
shieldMesh.visible = false;
scene.add(shieldMesh);

// ============================================================ Boss（周期性刷新，可同时多个）
function createBossMesh() {
  const g = new THREE.Group();
  const flesh = new THREE.MeshStandardMaterial({ color: 0x536b3c, roughness: 0.92, flatShading: true });
  const pale = new THREE.MeshStandardMaterial({ color: 0x7d9360, roughness: 1, flatShading: true });
  const armor = new THREE.MeshStandardMaterial({ color: 0x242b2d, roughness: 0.48, metalness: 0.55, flatShading: true });
  const bone = new THREE.MeshStandardMaterial({ color: 0xb9aa82, roughness: 0.86, flatShading: true });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), flesh);
  body.position.y = 2.45;
  body.scale.set(1.35, 1.48, 0.92);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.05, 0.34), armor);
  chest.position.set(0, 2.72, -0.84);
  chest.rotation.x = -0.08;
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.02, 0.28, 8), armor);
  belt.position.y = 1.35;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.78, 14, 10), pale);
  head.position.set(0, 4.18, -0.12);
  head.scale.set(1, 1.08, 0.9);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.22, 0.28), flesh);
  brow.position.set(0, 4.3, -0.72);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.42, 0.56), flesh);
  jaw.position.set(0, 3.82, -0.69);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff5b42, emissive: 0xff160c, emissiveIntensity: 3, roughness: 0.15 });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.115, 8, 6), eyeMat);
  e1.position.set(-0.27, 4.23, -0.84);
  const e2 = e1.clone(); e2.position.x = 0.27;
  const hornGeo = new THREE.ConeGeometry(0.18, 0.85, 7);
  const hornL = new THREE.Mesh(hornGeo, bone);
  hornL.position.set(-0.55, 4.78, -0.02); hornL.rotation.z = -0.48;
  const hornR = hornL.clone(); hornR.position.x = 0.55; hornR.rotation.z = 0.48;

  function makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 1.35, 3.18, -0.08);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.48, 9, 7), flesh);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.12, 5, 8), flesh);
    upper.position.y = -0.82;
    const gauntlet = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.3, 0.72, 8), armor);
    gauntlet.position.set(0, -1.62, -0.05);
    const claw = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.48, 0.68), pale);
    claw.position.set(0, -2.05, -0.18);
    pivot.add(shoulder, upper, gauntlet, claw);
    pivot.rotation.x = 0.5;
    pivot.rotation.z = side * -0.12;
    return pivot;
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);
  const legGeo = new THREE.CapsuleGeometry(0.4, 0.72, 5, 8);
  const legL = new THREE.Mesh(legGeo, flesh); legL.position.set(-0.55, 0.73, 0);
  const legR = legL.clone(); legR.position.x = 0.55;
  const bootGeo = new THREE.BoxGeometry(0.72, 0.38, 1.02);
  const bootL = new THREE.Mesh(bootGeo, armor); bootL.position.set(-0.55, 0.2, -0.2);
  const bootR = bootL.clone(); bootR.position.x = 0.55;
  const loincloth = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.15, 4, 1, true), armor);
  loincloth.position.set(0, 1.05, -0.08); loincloth.rotation.y = Math.PI / 4;
  g.add(body, chest, belt, head, brow, jaw, e1, e2, hornL, hornR, armL, armR, legL, legR, bootL, bootR, loincloth);
  g.traverse((o) => { o.castShadow = true; });
  g.userData.armL = armL;
  g.userData.armR = armR;
  return g;
}

let bosses = [];

function spawnBoss() {
  const diff = diffAt(state.dist);
  const mesh = createBossMesh();
  const s = 1 + Math.min(diff * 0.08, 1.6);
  mesh.scale.set(s, s, s);
  // 血量同时随距离和当前兵力成长，防止大部队秒杀
  const hp = 350 + diff * 280 + state.count * 8;
  const boss = {
    mesh, hp, maxHp: hp,
    x: (Math.random() - 0.5) * 4,
    z: squad.z - 85,
    slamTimer: 2,
    throwTimer: 1.5,
    hammerTimer: 5,
    spikeTimer: 3.5,
  };
  mesh.position.set(boss.x, 0, boss.z);
  scene.add(mesh);
  bosses.push(boss);
  ui.bossbar.classList.add('visible');
  showBanner('BOSS 来袭');
  sfx.bossRoar();
  state.shake = 0.4;
}

function spawnSideBoss() {
  const keys = Object.keys(SIDE_BOSSES);
  const key = keys[Math.floor((state.dist / 100) % keys.length)];
  const config = SIDE_BOSSES[key];
  const mesh = createBossMesh();
  mesh.scale.setScalar(0.78);
  const hp = (260 + diffAt(state.dist) * 190 + state.count * 5) * config.hp;
  const boss = {
    mesh, hp, maxHp: hp, sideType: key, coinReward: config.reward,
    x: 0, z: squad.z - 34, slamTimer: 2.2, throwTimer: 2, hammerTimer: 5, spikeTimer: 4,
  };
  mesh.position.set(0, 0, boss.z);
  scene.add(mesh);
  bosses.push(boss);
  ui.bossbar.classList.add('visible');
  showBanner(`${config.name} / 2D BOSS`);
  sfx.bossRoar();
}

// ============================================================ 游戏状态
const meta = loadMeta();
const sfx = new SFX();
sfx.setMuted(meta.settings.muted);
const state = {
  phase: 'menu',            // menu | run | result
  dist: 0,
  best: parseInt(localStorage.getItem('dg_best') || '0', 10),
  count: 10,
  maxCount: 10,
  kills: 0,
  runCoins: 0,
  coinRushTime: 0,
  weapon: 'rifle',
  fireAcc: 0,
  fireIndex: 0,
  rageTime: 0,
  shieldTime: 0,
  freezeTime: 0,
  laserZ: null,
  laserZ0: 0,
  shake: 0,
  // 无尽生成游标
  nextGateZ: -40,
  nextPickupZ: -70,
  nextWaveZ: -30,
  nextBossAt: FIRST_BOSS_AT,
  lastBossAt: 0,
  trickleTimer: 2,
  pullX: 0,
  pullTime: 0,
  mode: 'runner3d',         // runner3d | side2d
  modeMix: 0,
  modeEndDist: 0,
  nextSideAt: 220,
  nextCoinZ: -18,
  nextEliteAt: 150,
  nextPerkAt: 240,
  nextStoryAt: 430,
  nextVehicleAt: 560,
  sideBossAt: Infinity,
  sideBossSpawned: false,
  vehicleId: null,
  vehicleTime: 0,
  weaponTier: 1,
  weaponCopies: {},
  runMods: { damage: 0, fireRate: 0, range: 0, coin: 0 },
  biomeId: 'city',
  weatherId: 'clear',
  chapterGoal: Infinity,
  chapterWon: false,
  medicTimer: 12,
  engineerTimer: 18,
  lastLifestealKills: 0,
};

const squad = { x: 0, y: 0, z: 0, targetX: 0, vy: 0, speed: 8.5 };
let gates = [];
let zombies = [];
const perfState = { sampleTime: 0, frames: 0, averageFps: 60, scale: 1, entityScale: 1, hudTimer: 0, weatherFlip: false };

function updatePerformance(dt) {
  perfState.sampleTime += dt;
  perfState.frames++;
  perfState.hudTimer += dt;
  if (perfState.sampleTime < 2) return;
  perfState.averageFps = perfState.frames / perfState.sampleTime;
  if (meta.settings.quality === 'high') {
    if (perfState.averageFps < 48) perfState.scale = Math.max(0.65, perfState.scale - 0.1);
    else if (perfState.averageFps > 57) perfState.scale = Math.min(1, perfState.scale + 0.05);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * perfState.scale);
    perfState.entityScale = THREE.MathUtils.clamp(perfState.averageFps / 55, 0.55, 1);
  } else {
    perfState.scale = 0.7;
    perfState.entityScale = 0.48;
  }
  perfState.sampleTime = 0;
  perfState.frames = 0;
}

function applyBiome(id, announce = true) {
  const biome = BIOMES[id] || BIOMES.city;
  state.biomeId = id;
  state.weatherId = biome.weather || 'clear';
  scene.background.setHex(biome.sky);
  scene.fog.color.setHex(biome.fog);
  const weatherColors = { rain: 0x8abbd0, sand: 0xd79a57, toxic: 0x78d08b, storm: 0xa993ff, bloodmoon: 0xff4b55 };
  weatherMat.color.setHex(weatherColors[state.weatherId] || 0xffffff);
  weatherMat.size = state.weatherId === 'sand' ? 0.13 : 0.07;
  weatherMesh.visible = state.weatherId !== 'clear';
  if (announce) showBanner(`${biome.name} / ${WEATHER[state.weatherId].name}`);
  if (relicBonus('shield')) state.shieldTime = Math.max(state.shieldTime, relicBonus('shield'));
}

function updateWeather(dt) {
  if (!weatherMesh.visible) return;
  const positions = weatherGeo.attributes.position.array;
  const fall = state.weatherId === 'sand' ? 1.5 : 10;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i + 1] -= fall * dt;
    positions[i] += (state.weatherId === 'sand' ? 2.2 : 0.25) * dt;
    if (positions[i + 1] < 0) positions[i + 1] = 12;
    if (positions[i] > 13) positions[i] = -13;
  }
  weatherGeo.attributes.position.needsUpdate = true;
  weatherMesh.position.set(squad.x, 0, squad.z - 8);
}

function enterSideMode() {
  state.mode = 'side2d';
  state.modeEndDist = state.dist + 180;
  state.sideBossAt = state.dist + 112;
  state.sideBossSpawned = false;
  squad.targetX = 0;
  // 清空追击队列，2D 段落以可读的固定障碍为主，避免镜头切换时遭到不可见围攻。
  zombies = [];
  gateGroup.visible = false;
  pickupGroup.visible = false;
  for (const offset of [24, 47, 73, 98, 126, 156]) spawnSideObstacle(squad.z - offset);
  for (const offset of [14, 38, 63, 88, 112, 140, 168]) spawnCoinTrail(squad.z - offset, true, 7);
  showBanner('2D 封锁区 / 跳跃模式');
  ui.modeTag?.classList.add('visible');
  ui.hud?.classList.add('side-active');
}

function exitSideMode() {
  state.mode = 'runner3d';
  squad.y = 0;
  squad.vy = 0;
  gateGroup.visible = true;
  pickupGroup.visible = true;
  state.nextGateZ = squad.z - 42;
  state.nextPickupZ = squad.z - 72;
  state.nextWaveZ = squad.z - 34;
  state.trickleTimer = 1.5;
  state.nextSideAt = state.dist + 360;
  ui.modeTag?.classList.remove('visible');
  ui.hud?.classList.remove('side-active');
  showBanner('3D 突围模式');
}

// ============================================================ 敌人生成
// 按距离解锁的僵尸类型池：越往后特殊僵尸占比越高
function rollZombieType() {
  const unlocked = ZOMBIE_TYPE_KEYS.filter((k) => state.dist >= ZOMBIE_TYPES[k].unlockAt);
  // 普通僵尸始终是主力，特殊类型均分剩余概率
  const specialShare = Math.min(0.55, 0.12 * (unlocked.length - 1));
  if (unlocked.length === 1 || Math.random() > specialShare) return 'normal';
  const specials = unlocked.filter((k) => k !== 'normal');
  return specials[(Math.random() * specials.length) | 0];
}

function spawnWave(zCenter, size) {
  const diff = diffAt(state.dist);
  for (let i = 0; i < size; i++) {
    if (zombies.length >= Math.round(MAX_ZOMBIE_RENDER * perfState.entityScale)) return;
    const typeKey = rollZombieType();
    const t = ZOMBIE_TYPES[typeKey];
    const hp = t.hp(diff);
    zombies.push({
      type: typeKey,
      x: (Math.random() - 0.5) * (ROAD_W - 1.2),
      z: zCenter - Math.random() * 8,
      hp, maxHp: hp,
      phase: Math.random() * Math.PI * 2,
      rotY: 0,
      scale: t.scaleBase + Math.random() * 0.2,
      speedBonus: Math.random() * 0.5,
      skillT: 1 + Math.random() * 3, // 技能计时器错开
      hidden: false,
      y: 0,
    });
  }
}

// 每帧推进生成游标：门 / 道具 / 僵尸波 / Boss
function updateSpawners(dt) {
  const diff = diffAt(state.dist);

  if (state.mode === 'runner3d') {
    while (state.nextGateZ > squad.z - 130) {
      makeGatePair(state.nextGateZ);
      state.nextGateZ -= GATE_SPACING + Math.random() * 20;
    }

    while (state.nextPickupZ > squad.z - 130) {
      const roll = Math.random();
      const type = roll < 0.28 ? 'medkit'
        : roll < 0.46 ? 'rage'
        : roll < 0.62 ? 'shield'
        : roll < 0.76 ? 'laser'
        : roll < 0.9 ? 'freeze'
        : 'nuke';
      createPickup((Math.random() - 0.5) * 6, state.nextPickupZ, type);
      state.nextPickupZ -= PICKUP_SPACING + Math.random() * 60;
    }
  }

  while (state.nextCoinZ > squad.z - 125) {
    spawnCoinTrail(state.nextCoinZ, state.mode === 'side2d', state.mode === 'side2d' ? 6 : 5);
    state.nextCoinZ -= state.mode === 'side2d' ? 26 : 22 + Math.random() * 10;
  }

  if (state.mode === 'runner3d') {
    // 波次密度和规模随距离增长，直到铺满屏幕的量级
    while (state.nextWaveZ > squad.z - 110) {
      spawnWave(state.nextWaveZ, Math.round(3 + diff * 3 + Math.random() * 4));
      state.nextWaveZ -= Math.max(7, WAVE_SPACING - diff * 1.6);
    }

    // 后期持续从前方渗入散兵
    state.trickleTimer -= dt;
    if (state.trickleTimer <= 0) {
      state.trickleTimer = Math.max(0.3, 2.2 - diff * 0.15);
      spawnWave(squad.z - 55, 1 + Math.floor(diff * 1.2));
    }
  }

  // 周期性 Boss
  if (state.mode === 'runner3d' && state.dist >= state.nextBossAt) {
    state.lastBossAt = state.nextBossAt;
    state.nextBossAt += BOSS_INTERVAL;
    spawnBoss();
  }

  if (state.mode === 'runner3d' && state.dist >= state.nextSideAt && bosses.length === 0) enterSideMode();
  if (state.mode === 'side2d' && state.dist >= state.modeEndDist) exitSideMode();

  if (state.mode === 'runner3d' && state.dist >= state.nextEliteAt) {
    state.nextEliteAt += 260;
    state.coinRushTime = 12;
    spawnWave(squad.z - 60, Math.min(45, Math.round(14 + diff * 4)));
    showBanner('精英尸潮 / 双倍金币');
  }

  if (state.mode === 'side2d' && !state.sideBossSpawned && state.dist >= state.sideBossAt) {
    state.sideBossSpawned = true;
    spawnSideBoss();
  }

  if (state.phase === 'run' && state.mode === 'runner3d' && state.dist >= state.nextPerkAt) {
    state.nextPerkAt += 430;
    offerPerks();
  } else if (state.phase === 'run' && state.mode === 'runner3d' && state.dist >= state.nextStoryAt) {
    state.nextStoryAt += 720;
    offerStoryEvent();
  } else if (state.phase === 'run' && state.mode === 'runner3d' && state.dist >= state.nextVehicleAt) {
    state.nextVehicleAt += 850;
    offerVehicle();
  }

  if (meta.selectedChapter === 'endless') {
    const nextBiome = Object.entries(BIOMES).filter(([, biome]) => state.dist >= biome.at).at(-1)?.[0] || 'city';
    if (nextBiome !== state.biomeId) applyBiome(nextBiome);
  }
}

// 清理身后的实体
function cleanupBehind() {
  const behind = squad.z + 14;
  for (let i = gates.length - 1; i >= 0; i--) {
    if (gates[i].z > behind) {
      removeGatePair(gates[i]);
      gates.splice(i, 1);
    }
  }
  for (let i = pickups.length - 1; i >= 0; i--) {
    if (pickups[i].z > behind) {
      pickupGroup.remove(pickups[i].group);
      pickups.splice(i, 1);
    }
  }
  for (let i = zombies.length - 1; i >= 0; i--) {
    if (zombies[i].z > behind) zombies.splice(i, 1);
  }
  for (let i = obstacles.length - 1; i >= 0; i--) {
    if (obstacles[i].z > behind) {
      obstacleGroup.remove(obstacles[i].mesh);
      obstacles.splice(i, 1);
    }
  }
}

// ============================================================ UI
const ui = {
  hud: document.getElementById('hud'),
  levelTag: document.getElementById('levelTag'),
  progressFill: document.getElementById('progressFill'),
  countBadge: document.getElementById('countBadge'),
  bossbar: document.getElementById('bossbar'),
  bossFill: document.querySelector('#bossbar .fill'),
  weaponTag: document.getElementById('weaponTag'),
  buffRow: document.getElementById('buffRow'),
  banner: document.getElementById('banner'),
  flash: document.getElementById('flash'),
  menu: document.getElementById('menuOverlay'),
  result: document.getElementById('resultOverlay'),
  resultTitle: document.getElementById('resultTitle'),
  resultStats: document.getElementById('resultStats'),
  resultBtn: document.getElementById('resultBtn'),
  resetBtn: document.getElementById('resetBtn'),
  startBtn: document.getElementById('startBtn'),
  muteBtn: document.getElementById('muteBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  runCoinCount: document.getElementById('runCoinCount'),
  menuCoinCount: document.getElementById('menuCoinCount'),
  modeTag: document.getElementById('modeTag'),
  jumpTouchBtn: document.getElementById('jumpTouchBtn'),
  slideTouchBtn: document.getElementById('slideTouchBtn'),
  shop: document.getElementById('shopOverlay'),
  shopBtn: document.getElementById('shopBtn'),
  shopCloseBtn: document.getElementById('shopCloseBtn'),
  shopCoinCount: document.getElementById('shopCoinCount'),
  shopGrid: document.getElementById('shopGrid'),
  settings: document.getElementById('settingsOverlay'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsCloseBtn: document.getElementById('settingsCloseBtn'),
  soundSetting: document.getElementById('soundSetting'),
  shakeSetting: document.getElementById('shakeSetting'),
  qualitySetting: document.getElementById('qualitySetting'),
  pause: document.getElementById('pauseOverlay'),
  resumeBtn: document.getElementById('resumeBtn'),
  pauseSettingsBtn: document.getElementById('pauseSettingsBtn'),
  abandonBtn: document.getElementById('abandonBtn'),
  base: document.getElementById('baseOverlay'),
  baseBtn: document.getElementById('baseBtn'),
  baseCloseBtn: document.getElementById('baseCloseBtn'),
  classGrid: document.getElementById('classGrid'),
  formationGrid: document.getElementById('formationGrid'),
  buildingGrid: document.getElementById('buildingGrid'),
  relicGrid: document.getElementById('relicGrid'),
  campaign: document.getElementById('campaignOverlay'),
  campaignBtn: document.getElementById('campaignBtn'),
  campaignCloseBtn: document.getElementById('campaignCloseBtn'),
  chapterGrid: document.getElementById('chapterGrid'),
  dailyCard: document.getElementById('dailyCard'),
  records: document.getElementById('recordsOverlay'),
  recordsBtn: document.getElementById('recordsBtn'),
  recordsCloseBtn: document.getElementById('recordsCloseBtn'),
  achievementGrid: document.getElementById('achievementGrid'),
  leaderboardGrid: document.getElementById('leaderboardGrid'),
  choice: document.getElementById('choiceOverlay'),
  choiceEyebrow: document.getElementById('choiceEyebrow'),
  choiceTitle: document.getElementById('choiceTitle'),
  choiceText: document.getElementById('choiceText'),
  choiceGrid: document.getElementById('choiceGrid'),
  tutorial: document.getElementById('tutorialOverlay'),
  tutorialDoneBtn: document.getElementById('tutorialDoneBtn'),
};

function refreshBalances() {
  const wallet = formatNumber(meta.coins);
  ui.menuCoinCount.textContent = wallet;
  ui.shopCoinCount.textContent = wallet;
}

function renderShop() {
  refreshBalances();
  const upgradesHtml = Object.entries(UPGRADE_DEFS).map(([key, def]) => {
    const level = meta.upgrades[key];
    const maxed = level >= def.maxLevel;
    const cost = maxed ? 0 : upgradeCost(key, level);
    const bars = Array.from({ length: def.maxLevel }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
    return `<article class="shop-card">
      <div class="code">${def.code}</div><h3>${def.label}</h3><p>${def.description}</p>
      <div class="level-track" aria-label="${level}/${def.maxLevel} 级">${bars}</div>
      <button class="buy-btn" data-upgrade="${key}" ${maxed || meta.coins < cost ? 'disabled' : ''}>
        ${maxed ? '已满级' : `${formatNumber(cost)} 金币 / Lv.${level + 1}`}
      </button>
    </article>`;
  }).join('');
  const itemsHtml = Object.entries(ARMORY_ITEMS).map(([key, item]) => {
    const owned = item.type === 'blueprint' ? meta.blueprints.includes(key) : item.type === 'cosmetic' ? meta.cosmetics.includes(key) : false;
    const count = item.type === 'consumable' ? meta.inventory[key] || 0 : 0;
    return `<article class="shop-card"><div class="code">${item.type.toUpperCase()}</div><h3>${item.name}</h3><p>${item.description}</p>
      <button class="buy-btn" data-item="${key}" ${owned || meta.coins < item.cost ? 'disabled' : ''}>${owned ? '已拥有' : `${item.cost} 金币${count ? ` / 库存 ${count}` : ''}`}</button></article>`;
  }).join('');
  ui.shopGrid.innerHTML = upgradesHtml + itemsHtml;
}

function renderBase() {
  ui.classGrid.innerHTML = Object.entries(CLASSES).map(([key, item]) => `<button class="select-card ${meta.classId === key ? 'selected' : ''}" data-class="${key}"><strong>${item.name}</strong><small>${item.description}</small></button>`).join('');
  ui.formationGrid.innerHTML = Object.entries(FORMATIONS).map(([key, item]) => `<button class="select-card ${meta.formationId === key ? 'selected' : ''}" data-formation="${key}"><strong>${item.name}</strong><small>${item.description}</small></button>`).join('');
  ui.buildingGrid.innerHTML = Object.entries(BASE_BUILDINGS).map(([key, item]) => {
    const level = meta.base[key];
    const cost = Math.round(item.baseCost * Math.pow(1.55, level));
    return `<button class="select-card" data-building="${key}" ${level >= item.maxLevel || meta.coins < cost ? 'disabled' : ''}><strong>${item.name} / Lv.${level}</strong><small>${item.description}</small><span class="cost">${level >= item.maxLevel ? '已满级' : `${cost} 金币`}</span></button>`;
  }).join('');
  ui.relicGrid.innerHTML = Object.entries(RELICS).map(([key, item]) => `<article class="select-card ${meta.relics.includes(key) ? 'selected' : 'locked'}"><strong>${item.name}</strong><small>${meta.relics.includes(key) ? item.description : '击败 Boss 后有机会发现'}</small></article>`).join('');
}

function renderCampaign() {
  const endlessSelected = meta.selectedChapter === 'endless';
  ui.chapterGrid.innerHTML = `<button class="select-card ${endlessSelected ? 'selected' : ''}" data-chapter="endless"><strong>无尽远征</strong><small>所有地图依次出现，挑战极限距离。</small></button>` + CHAPTERS.map((chapter, index) => {
    const unlocked = index <= meta.unlockedChapter;
    return `<button class="select-card ${meta.selectedChapter === chapter.id ? 'selected' : ''}" data-chapter="${chapter.id}" ${unlocked ? '' : 'disabled'}><strong>${chapter.name}</strong><small>目标 ${chapter.goal}m · ${unlocked ? '已解锁' : '完成上一章解锁'}</small></button>`;
  }).join('');
  const daily = dailySeed();
  ui.dailyCard.innerHTML = `<button class="select-card ${meta.selectedChapter === 'daily' ? 'selected' : ''}" data-chapter="daily"><strong>每日挑战 / ${daily.key}</strong><small>固定种子 ${daily.seed} · 最佳 ${meta.daily.best}m · ${meta.daily.completed ? '已完成' : '奖励 120 金币'}</small></button>`;
}

function renderRecords() {
  ui.achievementGrid.innerHTML = Object.entries(ACHIEVEMENTS).map(([key, achievement]) => {
    const value = meta.stats[achievement.stat] || 0;
    const done = Boolean(meta.achievements[key]);
    const pct = Math.min(100, value / achievement.target * 100);
    return `<article class="select-card ${done ? 'selected' : ''}"><strong>${achievement.name}</strong><small>${achievement.description} · 奖励 ${achievement.reward}</small><div class="progress-line"><b style="width:${pct}%"></b></div></article>`;
  }).join('');
  ui.leaderboardGrid.innerHTML = meta.leaderboard.length ? meta.leaderboard.slice(0, 8).map((entry, index) => `<article class="select-card"><strong>#${index + 1} · ${entry.distance}m</strong><small>${entry.mode} · ${entry.className} · ${entry.date}</small></article>`).join('') : '<article class="select-card"><strong>暂无记录</strong><small>完成一次行动后将在这里生成本地排名。</small></article>';
}

let pendingChoice = null;
function openChoice({ eyebrow, title, text, options, onPick }) {
  if (state.phase !== 'run') return;
  state.phase = 'choice';
  pendingChoice = onPick;
  ui.choiceEyebrow.textContent = eyebrow;
  ui.choiceTitle.textContent = title;
  ui.choiceText.textContent = text;
  ui.choiceGrid.innerHTML = options.map((option, index) => `<button class="select-card" data-choice="${index}"><strong>${option.name || option.label}</strong><small>${option.description || ''}</small></button>`).join('');
  setPanel(ui.choice, true);
}

function offerPerks() {
  const options = [...PERKS].sort(() => Math.random() - 0.5).slice(0, 3);
  openChoice({ eyebrow: 'ROGUELIKE UPGRADE', title: '战术三选一', text: '选择一项仅在本次行动生效的强化。', options, onPick: (index) => {
    const perk = options[index];
    if (perk.stat === 'squad') state.count = addSquad(state.count, state.count * perk.value);
    else if (perk.stat === 'shield') state.shieldTime = Math.max(state.shieldTime, perk.value);
    else state.runMods[perk.stat] += perk.value;
    showBanner(perk.name);
  } });
}

function offerStoryEvent() {
  const event = STORY_EVENTS[Math.floor(Math.random() * STORY_EVENTS.length)];
  const options = event.choices.map((choice) => ({ ...choice, name: choice.label, description: choice.effect === 'coins' ? `获得 ${choice.value} 金币` : '改变本次行动状态' }));
  openChoice({ eyebrow: 'WASTELAND ENCOUNTER', title: event.title, text: event.text, options, onPick: (index) => {
    const choice = event.choices[index];
    if (choice.effect === 'squad') state.count = addSquad(state.count, choice.value);
    if (choice.effect === 'coins') state.runCoins += choice.value;
    if (choice.effect === 'damage') state.runMods.damage += choice.value;
    if (choice.effect === 'shield') state.shieldTime = Math.max(state.shieldTime, choice.value);
    if (choice.effect === 'weapon') state.weapon = WEAPON_KEYS[Math.floor(Math.random() * WEAPON_KEYS.length)];
    showBanner(choice.label);
  } });
}

function offerVehicle() {
  const entries = Object.entries(VEHICLES);
  const options = entries.map(([, vehicle]) => ({ name: vehicle.name, description: vehicle.description }));
  openChoice({ eyebrow: 'VEHICLE RECOVERY', title: '选择载具', text: '载具会在短时间内改变速度、防御与火力。', options, onPick: (index) => startVehicle(entries[index][0]) });
}

function setPanel(panel, visible) {
  panel.classList.toggle('visible', visible);
  panel.setAttribute('aria-hidden', String(!visible));
}

function applyQuality() {
  const high = meta.settings.quality === 'high';
  perfState.scale = high ? 1 : 0.7;
  perfState.entityScale = high ? 1 : 0.48;
  renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 2) : 0.85);
  renderer.shadowMap.enabled = high;
}

function syncSettingsUi() {
  ui.soundSetting.checked = !meta.settings.muted;
  ui.shakeSetting.checked = meta.settings.screenShake;
  ui.qualitySetting.value = meta.settings.quality;
  ui.muteBtn.classList.toggle('muted', meta.settings.muted);
  ui.muteBtn.setAttribute('aria-label', meta.settings.muted ? '开启声音' : '关闭声音');
  sfx.setMuted(meta.settings.muted);
  applyQuality();
}

refreshBalances();
syncSettingsUi();

function pauseRun() {
  if (state.phase !== 'run') return;
  state.phase = 'paused';
  setPanel(ui.pause, true);
  sfx.stopBgm();
  ui.resumeBtn.focus();
}

function resumeRun() {
  if (state.phase !== 'paused') return;
  state.phase = 'run';
  setPanel(ui.pause, false);
  sfx.startBgm();
}

function returnToBase(bankCoins = true) {
  if (bankCoins && state.runCoins > 0) {
    meta.coins = addSquad(meta.coins, state.runCoins);
    state.runCoins = 0;
    saveMeta(meta);
  }
  state.phase = 'menu';
  ui.hud.classList.remove('visible');
  ui.result.classList.remove('visible');
  setPanel(ui.pause, false);
  setPanel(ui.settings, false);
  setPanel(ui.base, false);
  setPanel(ui.campaign, false);
  setPanel(ui.records, false);
  setPanel(ui.choice, false);
  ui.menu.classList.add('visible');
  sfx.stopBgm();
  refreshBalances();
}

function showBanner(text) {
  ui.banner.textContent = text;
  ui.banner.classList.remove('show');
  void ui.banner.offsetWidth;
  ui.banner.classList.add('show');
}

function floatText(worldPos, text, good) {
  const v = worldPos.clone().project(camera);
  const el = document.createElement('div');
  el.className = `floatText ${good ? 'good' : 'bad'}`;
  el.textContent = text;
  el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
  el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
  ui.hud.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

const _proj = new THREE.Vector3();
function updateHud() {
  _proj.set(squad.x, 2.6 + squad.y, squad.z).project(camera);
  ui.countBadge.style.left = `${(_proj.x * 0.5 + 0.5) * window.innerWidth}px`;
  ui.countBadge.style.top = `${(-_proj.y * 0.5 + 0.5) * window.innerHeight}px`;
  ui.countBadge.textContent = formatNumber(state.count);
  ui.countBadge.title = `${Math.floor(state.count).toLocaleString('zh-CN')} 人`;
  ui.runCoinCount.textContent = formatNumber(state.runCoins);

  ui.levelTag.textContent = `${Math.floor(state.dist)}m`;
  // 进度条 = 距下一个 Boss
  const span = state.nextBossAt - state.lastBossAt;
  ui.progressFill.style.width = `${Math.min(100, ((state.dist - state.lastBossAt) / span) * 100).toFixed(1)}%`;

  let html = '';
  if (state.rageTime > 0) html += `<div class="buffChip">RAGE / 狂暴 ${state.rageTime.toFixed(0)}s</div>`;
  if (state.shieldTime > 0) html += `<div class="buffChip">ARMOR / 护盾 ${state.shieldTime.toFixed(0)}s</div>`;
  if (state.freezeTime > 0) html += `<div class="buffChip">CRYO / 冰冻 ${state.freezeTime.toFixed(0)}s</div>`;
  if (state.coinRushTime > 0) html += `<div class="buffChip">SALVAGE / 双倍金币 ${state.coinRushTime.toFixed(0)}s</div>`;
  if (state.vehicleId) html += `<div class="buffChip">VEHICLE / ${VEHICLES[state.vehicleId].name} ${state.vehicleTime.toFixed(0)}s</div>`;
  html += `<div class="buffChip">${BIOMES[state.biomeId].name} / ${WEATHER[state.weatherId].name}</div>`;
  ui.buffRow.innerHTML = html;

  if (bosses.length > 0) {
    const b = bosses[0];
    ui.bossbar.classList.add('visible');
    ui.bossFill.style.width = `${Math.max(0, (b.hp / b.maxHp) * 100).toFixed(1)}%`;
  } else {
    ui.bossbar.classList.remove('visible');
  }
}

// ============================================================ 输入
let dragging = false, lastPX = 0, jumpQueued = false;
const keys = {};
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (state.mode === 'side2d') {
    jumpQueued = true;
    return;
  }
  dragging = true;
  lastPX = e.clientX;
});
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastPX;
  lastPX = e.clientX;
  squad.targetX = THREE.MathUtils.clamp(squad.targetX + dx * 0.02, -SQUAD_X_LIMIT, SQUAD_X_LIMIT);
});
window.addEventListener('pointerup', () => { dragging = false; });
ui.jumpTouchBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation(); jumpQueued = true; ui.jumpTouchBtn.classList.add('active');
});
ui.jumpTouchBtn.addEventListener('pointerup', () => ui.jumpTouchBtn.classList.remove('active'));
ui.jumpTouchBtn.addEventListener('pointercancel', () => ui.jumpTouchBtn.classList.remove('active'));
const setTouchSlide = (active, event) => {
  event?.preventDefault(); event?.stopPropagation(); keys.KeyS = active; ui.slideTouchBtn.classList.toggle('active', active);
};
ui.slideTouchBtn.addEventListener('pointerdown', (e) => setTouchSlide(true, e));
ui.slideTouchBtn.addEventListener('pointerup', (e) => setTouchSlide(false, e));
ui.slideTouchBtn.addEventListener('pointercancel', (e) => setTouchSlide(false, e));
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (import.meta.env.DEV && e.code === 'F2' && state.phase === 'run' && state.mode === 'runner3d') {
    enterSideMode();
    e.preventDefault();
  }
  if (import.meta.env.DEV && e.code === 'F3' && state.phase === 'run') { offerPerks(); e.preventDefault(); }
  if (import.meta.env.DEV && e.code === 'F4' && state.phase === 'run') { offerStoryEvent(); e.preventDefault(); }
  if (import.meta.env.DEV && e.code === 'F5' && state.phase === 'run') { offerVehicle(); e.preventDefault(); }
  if (import.meta.env.DEV && e.code === 'F6' && state.phase === 'run' && state.mode === 'side2d') { spawnSideBoss(); e.preventDefault(); }
  if (import.meta.env.DEV && e.code === 'F7' && state.phase === 'run') { onVictory(); e.preventDefault(); }
  if (state.mode === 'side2d' && ['Space', 'KeyW', 'ArrowUp'].includes(e.code)) {
    jumpQueued = true;
    e.preventDefault();
  }
  if (e.code === 'Escape') {
    if (ui.settings.classList.contains('visible')) setPanel(ui.settings, false);
    else if (ui.shop.classList.contains('visible')) setPanel(ui.shop, false);
    else if (ui.base.classList.contains('visible')) setPanel(ui.base, false);
    else if (ui.campaign.classList.contains('visible')) setPanel(ui.campaign, false);
    else if (ui.records.classList.contains('visible')) setPanel(ui.records, false);
    else if (state.phase === 'run') pauseRun();
    else if (state.phase === 'paused') resumeRun();
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ============================================================ 游戏流程
function startRun() {
  applySquadCosmetic();
  // 清理旧战场
  for (const pair of gates) removeGatePair(pair);
  gates = [];
  pickupGroup.clear();
  pickups = [];
  coins = [];
  coinMesh.count = 0;
  for (const obstacle of obstacles) obstacleGroup.remove(obstacle.mesh);
  obstacles.length = 0;
  zombies = [];
  bullets.length = 0;
  for (const b of bosses) scene.remove(b.mesh);
  bosses = [];
  skulls = [];
  skullMesh.count = 0;
  warnRingMesh.count = 0;
  enemyBullets = [];
  enemyBulletMesh.count = 0;
  for (const w of shockwaves) w.mesh.visible = false;
  shockwaves = [];
  for (const sp of spikePatches) {
    sp.pool.spike.visible = false;
    sp.pool.ring.visible = false;
    sp.pool.busy = false;
  }
  spikePatches = [];
  for (const pool of bloodPools) pool.mesh.visible = false;
  resetChunks();

  squad.x = 0; squad.y = 0; squad.vy = 0; squad.targetX = 0; squad.z = 0;
  state.dist = 0;
  const classData = CLASSES[meta.classId];
  state.count = addSquad(10 + meta.upgrades.startingSquad * 5 + meta.base.hospital * 4, classData.startSquad || 0);
  if (meta.inventory.fieldkit > 0) {
    state.count = addSquad(state.count, 15);
    meta.inventory.fieldkit--;
  }
  state.maxCount = state.count;
  state.kills = 0;
  state.runCoins = 0;
  state.coinRushTime = 0;
  state.weapon = meta.blueprints[meta.blueprints.length - 1] in WEAPONS ? meta.blueprints[meta.blueprints.length - 1] : 'rifle';
  state.weaponTier = 1;
  state.weaponCopies = {};
  state.runMods = { damage: 0, fireRate: 0, range: 0, coin: 0 };
  state.fireAcc = 0;
  state.rageTime = 0;
  state.shieldTime = meta.inventory.armorplate > 0 ? 12 : 0;
  if (meta.inventory.armorplate > 0) meta.inventory.armorplate--;
  state.freezeTime = 0;
  state.laserZ = null;
  laserMesh.visible = false;
  for (const z of zapPool) { z.life = 0; z.line.visible = false; }
  state.nextGateZ = -40;
  state.nextPickupZ = -70;
  state.nextWaveZ = -30;
  state.nextBossAt = FIRST_BOSS_AT;
  state.lastBossAt = 0;
  state.trickleTimer = 2;
  state.pullTime = 0;
  state.mode = 'runner3d';
  state.modeMix = 0;
  state.nextSideAt = 220;
  state.nextCoinZ = -18;
  state.nextEliteAt = 150;
  state.nextPerkAt = 240;
  state.nextStoryAt = 430;
  state.nextVehicleAt = 560;
  state.sideBossAt = Infinity;
  state.sideBossSpawned = false;
  state.vehicleId = null;
  state.vehicleTime = 0;
  vehicleMesh.visible = false;
  state.chapterWon = false;
  state.medicTimer = 12;
  state.engineerTimer = 18;
  state.lastLifestealKills = 0;
  const chapter = CHAPTERS.find((item) => item.id === meta.selectedChapter);
  state.chapterGoal = chapter?.goal ?? (meta.selectedChapter === 'daily' ? 1000 : Infinity);
  const dailyBiome = pickWithSeed(Object.keys(BIOMES), dailySeed().seed, 2);
  applyBiome(chapter?.biome ?? (meta.selectedChapter === 'daily' ? dailyBiome : 'city'), false);
  gateGroup.visible = true;
  pickupGroup.visible = true;
  ui.modeTag.classList.remove('visible');
  ui.hud.classList.remove('side-active');
  ui.weaponTag.textContent = `${WEAPONS[state.weapon].name} · Mk.1`;
  ui.bossbar.classList.remove('visible');

  state.phase = 'run';
  ui.menu.classList.remove('visible');
  ui.result.classList.remove('visible');
  setPanel(ui.pause, false);
  setPanel(ui.shop, false);
  setPanel(ui.settings, false);
  setPanel(ui.base, false);
  setPanel(ui.campaign, false);
  setPanel(ui.records, false);
  ui.hud.classList.add('visible');
  saveMeta(meta);
  sfx.ensure();
  sfx.startBgm();
}

function settleRun(won = false) {
  const dist = Math.floor(state.dist);
  const completionReward = won ? 150 + (CHAPTERS.findIndex((item) => item.id === meta.selectedChapter) + 1) * 50 : 0;
  const dailyReward = meta.selectedChapter === 'daily' && won && !meta.daily.completed ? 120 : 0;
  meta.coins = addSquad(meta.coins, state.runCoins + completionReward + dailyReward);
  meta.stats.totalKills += state.kills;
  meta.stats.totalCoins += state.runCoins + completionReward + dailyReward;
  meta.stats.bestDistance = Math.max(meta.stats.bestDistance, dist);
  meta.stats.maxSquad = Math.max(meta.stats.maxSquad, state.maxCount);
  if (meta.selectedChapter === 'daily') {
    meta.daily.best = Math.max(meta.daily.best, dist);
    if (won) meta.daily.completed = true;
  }
  if (won) {
    const index = CHAPTERS.findIndex((item) => item.id === meta.selectedChapter);
    if (index >= 0) meta.unlockedChapter = Math.min(CHAPTERS.length - 1, Math.max(meta.unlockedChapter, index + 1));
  }
  meta.leaderboard.push({
    distance: dist,
    mode: meta.selectedChapter === 'endless' ? '无尽' : meta.selectedChapter === 'daily' ? '每日' : '战役',
    className: CLASSES[meta.classId].name,
    date: new Date().toLocaleDateString('zh-CN'),
  });
  meta.leaderboard.sort((a, b) => b.distance - a.distance);
  meta.leaderboard = meta.leaderboard.slice(0, 20);
  for (const [key, achievement] of Object.entries(ACHIEVEMENTS)) {
    if (!meta.achievements[key] && (meta.stats[achievement.stat] || 0) >= achievement.target) {
      meta.achievements[key] = true;
      meta.coins += achievement.reward;
    }
  }
  saveMeta(meta);
  refreshBalances();
  return { completionReward, dailyReward };
}

function onVictory() {
  if (state.phase !== 'run') return;
  state.phase = 'result';
  state.chapterWon = true;
  ui.hud.classList.remove('visible');
  ui.result.classList.add('visible');
  const rewards = settleRun(true);
  ui.resultTitle.textContent = '章节完成';
  ui.resultTitle.className = 'win';
  ui.resultStats.innerHTML = `目标达成 ${Math.floor(state.dist)}m<br/>击杀 ${state.kills} · 巅峰兵力 ${formatNumber(state.maxCount)}<br/>行动金币 ${formatNumber(state.runCoins)} · 完成奖励 ${rewards.completionReward + rewards.dailyReward}`;
  ui.resultBtn.textContent = '再次行动';
  sfx.stopBgm();
  sfx.levelUp();
}

function onDefeat() {
  if (state.phase === 'result') return;
  state.phase = 'result';
  ui.hud.classList.remove('visible');
  ui.result.classList.add('visible');
  const dist = Math.floor(state.dist);
  const isRecord = dist > state.best;
  if (isRecord) {
    state.best = dist;
    localStorage.setItem('dg_best', String(dist));
  }
  settleRun(false);
  ui.resultTitle.textContent = '全军覆没';
  ui.resultTitle.className = 'lose';
  ui.resultStats.innerHTML =
    `冲锋 ${dist}m ${isRecord ? ' / 新纪录' : `（最佳 ${state.best}m）`}<br/>` +
    `击杀 ${state.kills} &nbsp;|&nbsp; 巅峰兵力 ${formatNumber(state.maxCount)} 人<br/>` +
    `回收金币 ${formatNumber(state.runCoins)} &nbsp;|&nbsp; 钱包 ${formatNumber(meta.coins)}`;
  ui.resultBtn.textContent = '再次出击';
  sfx.stopBgm();
  sfx.lose();
}

ui.startBtn.addEventListener('click', () => {
  if (!meta.tutorialDone) setPanel(ui.tutorial, true);
  else startRun();
});
ui.tutorialDoneBtn.addEventListener('click', () => {
  meta.tutorialDone = true;
  saveMeta(meta);
  setPanel(ui.tutorial, false);
  startRun();
});
ui.resultBtn.addEventListener('click', startRun);
ui.resetBtn.addEventListener('click', () => {
  returnToBase(false);
});
ui.shopBtn.addEventListener('click', () => {
  renderShop();
  setPanel(ui.shop, true);
  ui.shopCloseBtn.focus();
});
ui.shopCloseBtn.addEventListener('click', () => setPanel(ui.shop, false));
ui.baseBtn.addEventListener('click', () => { renderBase(); setPanel(ui.base, true); ui.baseCloseBtn.focus(); });
ui.baseCloseBtn.addEventListener('click', () => setPanel(ui.base, false));
ui.campaignBtn.addEventListener('click', () => { renderCampaign(); setPanel(ui.campaign, true); ui.campaignCloseBtn.focus(); });
ui.campaignCloseBtn.addEventListener('click', () => setPanel(ui.campaign, false));
ui.recordsBtn.addEventListener('click', () => { renderRecords(); setPanel(ui.records, true); ui.recordsCloseBtn.focus(); });
ui.recordsCloseBtn.addEventListener('click', () => setPanel(ui.records, false));
ui.settingsBtn.addEventListener('click', () => {
  syncSettingsUi();
  setPanel(ui.settings, true);
  ui.settingsCloseBtn.focus();
});
ui.pauseBtn.addEventListener('click', pauseRun);
ui.resumeBtn.addEventListener('click', resumeRun);
ui.pauseSettingsBtn.addEventListener('click', () => {
  syncSettingsUi();
  setPanel(ui.settings, true);
  ui.settingsCloseBtn.focus();
});
ui.abandonBtn.addEventListener('click', () => returnToBase(true));
ui.settingsCloseBtn.addEventListener('click', () => setPanel(ui.settings, false));
ui.shopGrid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-upgrade]');
  if (!button) return;
  const key = button.dataset.upgrade;
  const def = UPGRADE_DEFS[key];
  const level = meta.upgrades[key];
  if (!def || level >= def.maxLevel) return;
  const cost = upgradeCost(key, level);
  if (meta.coins < cost) return;
  meta.coins -= cost;
  meta.upgrades[key]++;
  saveMeta(meta);
  renderShop();
});
ui.shopGrid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-item]');
  if (!button) return;
  const key = button.dataset.item;
  const item = ARMORY_ITEMS[key];
  if (!item || meta.coins < item.cost) return;
  const alreadyOwned = item.type === 'blueprint' ? meta.blueprints.includes(key) : item.type === 'cosmetic' ? meta.cosmetics.includes(key) : false;
  if (alreadyOwned) return;
  meta.coins -= item.cost;
  if (item.type === 'consumable') meta.inventory[key] = (meta.inventory[key] || 0) + 1;
  if (item.type === 'blueprint') meta.blueprints.push(key);
  if (item.type === 'cosmetic') { meta.cosmetics.push(key); meta.equippedCosmetic = key; }
  saveMeta(meta);
  renderShop();
});
ui.base.addEventListener('click', (event) => {
  const classButton = event.target.closest('[data-class]');
  const formationButton = event.target.closest('[data-formation]');
  const buildingButton = event.target.closest('[data-building]');
  if (classButton) meta.classId = classButton.dataset.class;
  if (formationButton) meta.formationId = formationButton.dataset.formation;
  if (buildingButton) {
    const key = buildingButton.dataset.building;
    const def = BASE_BUILDINGS[key];
    const level = meta.base[key];
    const cost = Math.round(def.baseCost * Math.pow(1.55, level));
    if (level < def.maxLevel && meta.coins >= cost) { meta.coins -= cost; meta.base[key]++; }
  }
  if (classButton || formationButton || buildingButton) { saveMeta(meta); refreshBalances(); renderBase(); }
});
ui.campaign.addEventListener('click', (event) => {
  const button = event.target.closest('[data-chapter]');
  if (!button || button.disabled) return;
  meta.selectedChapter = button.dataset.chapter;
  saveMeta(meta);
  renderCampaign();
});
ui.choiceGrid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-choice]');
  if (!button || !pendingChoice) return;
  const index = Number(button.dataset.choice);
  const callback = pendingChoice;
  pendingChoice = null;
  callback(index);
  setPanel(ui.choice, false);
  state.phase = 'run';
});
ui.soundSetting.addEventListener('change', () => {
  meta.settings.muted = !ui.soundSetting.checked;
  saveMeta(meta);
  syncSettingsUi();
});
ui.shakeSetting.addEventListener('change', () => {
  meta.settings.screenShake = ui.shakeSetting.checked;
  saveMeta(meta);
});
ui.qualitySetting.addEventListener('change', () => {
  meta.settings.quality = ui.qualitySetting.value;
  saveMeta(meta);
  applyQuality();
});
ui.muteBtn.addEventListener('click', () => {
  sfx.setMuted(!sfx.muted);
  meta.settings.muted = sfx.muted;
  saveMeta(meta);
  syncSettingsUi();
});

function loseSoldiers(n) {
  if (state.count <= 0 || state.shieldTime > 0) return;
  if (state.vehicleId === 'apc') return;
  const lossMultiplier = FORMATIONS[meta.formationId].loss * (state.vehicleId ? 0.55 : 1);
  state.count = Math.max(0, state.count - Math.max(1, Math.round(n * lossMultiplier)));
  state.runCoins += relicBonus('hurtCoin');
  state.shake = Math.min(0.5, state.shake + 0.18);
  sfx.squadHurt();
  if (state.count <= 0) {
    spawnBurst(squad.x, 1, squad.z, 0xff4040, 30, 7, 0.8);
    onDefeat();
  }
}

// ============================================================ 道具效果
function applyPickup(type) {
  const info = ITEMS[type];
  sfx.pickup(type);
  floatText(new THREE.Vector3(squad.x, 2.5, squad.z), `${info.icon} ${info.name}`, true);
  if (type === 'medkit') {
    const add = Math.max(5, Math.round(state.count * 0.15));
    state.count = addSquad(state.count, add);
    state.maxCount = Math.max(state.maxCount, state.count);
  } else if (type === 'rage') {
    state.rageTime = 8;
  } else if (type === 'shield') {
    state.shieldTime = 6;
  } else if (type === 'laser') {
    // 光墙从队前向远方推进
    state.laserZ = squad.z - 3;
    state.laserZ0 = state.laserZ; // 本次激光的标记，Boss 只受创一次
    laserMesh.visible = true;
    sfx.laser();
    state.shake = Math.min(0.5, state.shake + 0.2);
  } else if (type === 'freeze') {
    state.freezeTime = 5;
    sfx.freeze();
    for (const zb of zombies) spawnBurst(zb.x, 0.9, zb.z, 0x9adfff, 3, 1.2, 0.4);
  } else if (type === 'nuke') {
    sfx.nuke();
    ui.flash.classList.remove('boom');
    void ui.flash.offsetWidth;
    ui.flash.classList.add('boom');
    state.shake = 0.6;
    for (let i = zombies.length - 1; i >= 0; i--) {
      gore(zombies[i].x, zombies[i].z);
      state.kills++;
      zombies.splice(i, 1);
    }
    for (const b of bosses) b.hp -= b.maxHp * 0.2;
  }
}

// 门是否还能吃子弹：负数门未升满级 / 武器门未激活
function gateInteractive(gate) {
  return (gate.upgradable && gate.value < 15) || (gate.op === 'weapon' && gate.remaining > 0);
}

// 子弹 / 电弧命中门的统一结算
function hitInteractiveGate(gate) {
  if (gate.op === 'weapon') {
    gate.remaining--;
    if (gate.remaining <= 0) {
      activateWeaponGate(gate);
    } else {
      drawGateCanvas(gate);
      if (gate.remaining % 4 === 0) sfx.gateCharge();
    }
  } else {
    gate.hits++;
    if (gate.hits % 3 === 0) {
      gate.value += 1;
      drawGateCanvas(gate);
      sfx.gateTick();
    }
  }
}

// 武器门被打到 0 → 立即激活装备，无需穿门
function activateWeaponGate(gate) {
  state.weapon = gate.value;
  state.weaponTier = 1;
  ui.weaponTag.textContent = `${WEAPONS[gate.value].name} · Mk.1`;
  drawGateCanvas(gate);
  floatText(new THREE.Vector3(gate.x, GATE_H, gate.z), `${WEAPONS[gate.value].name} 已装备!`, true);
  spawnBurst(gate.x, 1.8, gate.z, 0xffd24a, 26, 6, 0.5);
  spawnBurst(gate.x, 2.4, gate.z, 0x7dff9b, 18, 5, 0.5);
  sfx.weaponUp();
}

// ============================================================ 每帧逻辑
function updateRun(dt, time) {
  // ---- 移动（永远向前跑）
  if (state.vehicleId) {
    state.vehicleTime -= dt;
    if (state.vehicleTime <= 0) {
      state.vehicleId = null;
      vehicleMesh.visible = false;
      showBanner('载具燃料耗尽');
    }
  }
  if (meta.classId === 'medic') {
    state.medicTimer -= dt;
    if (state.medicTimer <= 0) {
      state.medicTimer = 12;
      state.count = addSquad(state.count, Math.max(2, Math.round(state.count * 0.03)));
    }
  }
  if (meta.classId === 'engineer') {
    state.engineerTimer -= dt;
    if (state.engineerTimer <= 0) {
      state.engineerTimer = 18;
      state.shieldTime = Math.max(state.shieldTime, 3);
    }
  }
  if (state.mode === 'runner3d') {
    if (keys.ArrowLeft || keys.KeyA) squad.targetX -= 9 * dt;
    if (keys.ArrowRight || keys.KeyD) squad.targetX += 9 * dt;
    squad.targetX = THREE.MathUtils.clamp(squad.targetX, -SQUAD_X_LIMIT, SQUAD_X_LIMIT);
    squad.x += (squad.targetX - squad.x) * Math.min(1, dt * 12);
    squad.y = 0;
  } else {
    squad.targetX = 0;
    squad.x += (0 - squad.x) * Math.min(1, dt * 7);
    if (jumpQueued && squad.y <= 0.001) squad.vy = 7.8 * (1 + relicBonus('jump'));
    jumpQueued = false;
    squad.vy -= 18 * dt;
    squad.y = Math.max(0, squad.y + squad.vy * dt);
    if (squad.y <= 0) squad.vy = 0;
  }
  const vehicleSpeed = state.vehicleId ? VEHICLES[state.vehicleId].speed : 1;
  squad.z -= squad.speed * vehicleSpeed * dt;
  state.dist = -squad.z;
  if (!state.chapterWon && state.dist >= state.chapterGoal) {
    onVictory();
    return;
  }

  state.rageTime = Math.max(0, state.rageTime - dt);
  state.shieldTime = Math.max(0, state.shieldTime - dt);
  state.freezeTime = Math.max(0, state.freezeTime - dt);
  state.coinRushTime = Math.max(0, state.coinRushTime - dt);
  const lifestealEvery = relicBonus('lifesteal');
  if (lifestealEvery > 0 && state.kills - state.lastLifestealKills >= lifestealEvery) {
    const recovered = Math.floor((state.kills - state.lastLifestealKills) / lifestealEvery);
    state.count = addSquad(state.count, recovered);
    state.lastLifestealKills += recovered * lifestealEvery;
  }

  // ---- 全屏激光推进
  if (state.laserZ !== null) {
    state.laserZ -= 55 * dt;
    laserMesh.position.set(0, 1.3, state.laserZ);
    laserMesh.material.opacity = 0.55 + Math.sin(performance.now() * 0.05) * 0.25;
    for (let i = zombies.length - 1; i >= 0; i--) {
      const zb = zombies[i];
      if (zb.z > state.laserZ - 0.5) {
        gore(zb.x, zb.z);
        spawnBurst(zb.x, 1.0, zb.z, 0xff4a6a, 8, 4, 0.35);
        state.kills++;
        zombies.splice(i, 1);
      }
    }
    for (const boss of bosses) {
      if (boss.z > state.laserZ - 0.5 && boss._laserMark !== state.laserZ0) {
        boss._laserMark = state.laserZ0;
        boss.hp -= boss.maxHp * 0.3;
        spawnBurst(boss.x, 2.5, boss.z, 0xff4a6a, 24, 6, 0.5);
      }
    }
    if (state.laserZ < squad.z - 75) {
      state.laserZ = null;
      laserMesh.visible = false;
    }
  }

  updateSpawners(dt);
  cleanupBehind();

  if (state.mode === 'side2d') {
    for (const obstacle of obstacles) {
      if (obstacle.terrain === '移动升降机') obstacle.mesh.position.y = obstacle.height / 2 + Math.sin(time * 2 + obstacle.z) * 0.45;
      if (!obstacle.hit && Math.abs(obstacle.z - squad.z) < 0.85) {
        obstacle.hit = true;
        const sliding = keys.KeyS || keys.ArrowDown;
        const avoided = obstacle.terrain === '滑索' ? sliding : squad.y >= Math.min(1.05, obstacle.height * 0.58);
        if (!avoided) {
          loseSoldiers(Math.max(1, Math.round(state.count * 0.08)));
          spawnBurst(0, 0.7, obstacle.z, 0xff704c, 18, 5, 0.45);
          if (state.phase === 'result') return;
        }
      }
    }
  }

  // ---- 全员齐射
  const weapon = WEAPONS[state.weapon];
  const renderN = Math.max(1, Math.min(state.count, MAX_SOLDIER_RENDER));
  const scale = formationScale(renderN);
  const shooters = Math.min(state.count, MAX_SHOOTERS);
  const rageMult = state.rageTime > 0 ? 2 : 1;
  const weaponPower = 1 + state.dist / 600; // 武器随距离越来越强
  const classData = CLASSES[meta.classId];
  const formationData = FORMATIONS[meta.formationId];
  const weatherDamage = WEATHER[state.weatherId]?.damage || 1;
  const vehicleDamage = state.vehicleId ? VEHICLES[state.vehicleId].damage : 1;
  const tierDamage = 1 + (state.weaponTier - 1) * 0.25;
  const dmgScale = (state.count / shooters) * weaponPower *
    (1 + meta.upgrades.damage * 0.1 + meta.base.arsenal * 0.04 + state.runMods.damage + relicBonus('damage')) *
    classData.damage * formationData.damage * weatherDamage * vehicleDamage * tierDamage;
  const fireRateBonus = (1 + meta.upgrades.fireRate * 0.08 + meta.base.training * 0.03 + state.runMods.fireRate + relicBonus('fireRate')) * classData.fireRate;
  state.fireAcc += shooters * weapon.rate * fireRateBonus * rageMult * dt;
  let shots = Math.min(Math.floor(state.fireAcc), 40);
  state.fireAcc -= shots;
  while (shots-- > 0) {
    const idx = state.fireIndex++ % renderN;
    const sx = squad.x + unitSpiral[idx].dx * scale;
    const sz = squad.z + unitSpiral[idx].dz * scale;
    if (weapon.kind === 'zap') {
      fireZap(sx, sz - 0.5, weapon.dmg * dmgScale);
    } else {
      const extraProjectile = Math.random() < relicBonus('multishot') ? 1 : 0;
      for (let p = 0; p < weapon.pellets + extraProjectile; p++) {
        spawnBullet(sx + 0.16, 0.72 + squad.y, sz - 0.5, weapon, dmgScale);
      }
    }
    sfx.shot(state.weapon);
  }

  // ---- 门逻辑
  for (const pair of gates) {
    if (state.mode !== 'runner3d') break;
    if (pair.consumed) continue;
    for (const gate of [pair.a, pair.b]) {
      if (!gateInteractive(gate)) continue;
      for (const b of bullets) {
        if (b.dead) continue;
        if (b.z <= gate.z + 0.4 && b.z >= gate.z - 1.2 && Math.abs(b.x - gate.x) < GATE_W / 2) {
          b.dead = true;
          spawnBurst(b.x, b.y + 0.6, gate.z, 0xffe27a, 6, 3, 0.3);
          hitInteractiveGate(gate);
        }
      }
    }
    // 穿门（武器门不需要穿，穿过无事发生）
    if (squad.z <= pair.z && squad.z > pair.z - 2) {
      const gate = Math.abs(squad.x - pair.a.x) < Math.abs(squad.x - pair.b.x) ? pair.a : pair.b;
      pair.consumed = true;
      if (gate.op === 'special') {
        applySpecialGate(gate.value);
        floatText(new THREE.Vector3(gate.x, GATE_H, gate.z), gateLabel(gate), true);
        spawnBurst(gate.x, 1.8, gate.z, 0xffb257, 24, 6, 0.55);
      } else if (gate.op !== 'weapon') {
        const before = state.count;
        state.count = applyGate(gate, state.count);
        state.maxCount = Math.max(state.maxCount, state.count);
        const good = state.count >= before;
        floatText(new THREE.Vector3(gate.x, GATE_H, gate.z), gateLabel(gate), good);
        spawnBurst(gate.x, 1.6, gate.z, good ? 0x59b8ff : 0xff6060, 20, 6, 0.5);
        good ? sfx.gateGood() : sfx.gateBad();
      }
      pair.a.group.visible = false;
      pair.b.group.visible = false;
      if (state.count <= 0) {
        onDefeat();
        return;
      }
    }
  }

  // ---- 道具箱拾取
  const pickR = squadRadius() + 0.9;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pk = pickups[i];
    pk.crate.rotation.y = time * 2;
    pk.group.position.y = Math.sin(time * 3 + pk.x) * 0.12;
    if (state.mode === 'runner3d' && Math.abs(pk.z - squad.z) < 1.2 && Math.abs(pk.x - squad.x) < pickR) {
      applyPickup(pk.type);
      spawnBurst(pk.x, 1.2, pk.z, ITEMS[pk.type].color, 18, 5, 0.5);
      pickupGroup.remove(pk.group);
      pickups.splice(i, 1);
    }
  }

  // ---- 僵尸：生成即追击，手臂朝向小队；每种类型有专属技能
  // 后期基础速度可超过小队跑速（8.5），从背后也能追上
  const diff = diffAt(state.dist);
  const zSpeed = Math.min(10.5, 3.4 + diff * 0.55) * (WEATHER[state.weatherId]?.enemySpeed || 1);
  const frozen = state.freezeTime > 0;
  for (let i = zombies.length - 1; i >= 0; i--) {
    const zb = zombies[i];
    const t = ZOMBIE_TYPES[zb.type];
    const dx = squad.x - zb.x;
    const dz = squad.z - zb.z;
    const len = Math.hypot(dx, dz) || 1;

    // ---- 类型技能（冰冻时全部停摆）
    if (!frozen) zb.skillT -= dt;
    let skillSpeedMul = frozen ? 0 : 1;
    if (frozen) {
      // 冻结中：不移动、不放技能，但照常挨打
    } else if (zb.type === 'normal') {
      // 暴走：逼近后短暂提速
      if (len < 13) skillSpeedMul = 1.4;
    } else if (zb.type === 'hunter') {
      // 突进：周期性猛冲，冲刺时留下红色残影
      if (zb.skillT <= 0) zb.skillT = 2.6 + Math.random();
      if (zb.skillT < 0.7) {
        skillSpeedMul = 2.6;
        if (Math.random() < 0.3) spawnBurst(zb.x, 0.6, zb.z, 0xc4553c, 3, 1, 0.25);
      }
    } else if (zb.type === 'butcher') {
      // 投掷兽颅：中远距离抡起兽颅砸向小队
      if (zb.skillT <= 0 && len > 8 && len < 34) {
        zb.skillT = 4 + Math.random() * 2;
        throwSkull(zb.x, 1.6 * zb.scale, zb.z, 0.03);
      }
    } else if (zb.type === 'shadow') {
      // 潜行：周期性相位隐身，隐身时子弹打不中
      if (zb.skillT <= 0) {
        zb.hidden = !zb.hidden;
        zb.skillT = zb.hidden ? 1.2 : 1.8;
        spawnBurst(zb.x, 0.8, zb.z, 0x8a7ab8, 8, 2.5, 0.3);
      }
    } else if (zb.type === 'witch') {
      // 咒疗：周期性治疗周围僵尸
      if (zb.skillT <= 0 && len < 30) {
        zb.skillT = 4;
        let healed = false;
        for (const other of zombies) {
          if (other === zb || other.hp <= 0) continue;
          if (Math.hypot(other.x - zb.x, other.z - zb.z) < 5) {
            other.hp = Math.min(other.maxHp, other.hp + Math.max(1, other.maxHp * 0.35));
            healed = true;
          }
        }
        if (healed) spawnBurst(zb.x, 1.2, zb.z, 0x58e4a8, 16, 3.5, 0.5);
      }
    } else if (zb.type === 'banshee') {
      // 诱捕：放出蝙蝠把小队横向拽向自己
      if (zb.skillT <= 0 && len < 22) {
        zb.skillT = 5;
        state.pullX = zb.x;
        state.pullTime = 0.7;
        spawnBurst(zb.x, 1.5, zb.z, 0xc46aa8, 20, 4, 0.6);
        floatText(new THREE.Vector3(zb.x, 2.2, zb.z), '🦇 诱捕！', false);
        sfx.gateBad();
      }
    } else if (zb.type === 'infected') {
      // 被感染的士兵：保持距离，低射速朝人类开火
      if (len < 15) skillSpeedMul = 0; // 到达射程后站定
      if (zb.skillT <= 0 && len < 32) {
        zb.skillT = 2.4 + Math.random() * 1.6;
        const mx = zb.x + ((squad.x - zb.x) / len) * 0.5;
        const mz = zb.z + ((squad.z - zb.z) / len) * 0.5;
        spawnEnemyBullet(mx, 0.75, mz);
        spawnBurst(mx, 0.8, mz, 0xffb060, 4, 1.5, 0.15); // 枪口焰
        sfx.enemyShot(len);
      }
    }

    // 电击麻痹减速
    if (zb.slowT > 0) {
      zb.slowT -= dt;
      skillSpeedMul *= 0.3;
    }
    const sp = (zSpeed * t.speedMul + (zb.speedBonus ?? 0)) * skillSpeedMul;
    zb.x += (dx / len) * sp * dt;
    zb.z += (dz / len) * sp * dt;
    zb.rotY = Math.atan2(-dx, -dz); // 模型面朝 -z，此角度让它面向小队
    zb.y = 0;

    // 隐身状态不吃子弹
    if (!zb.hidden) {
      for (const b of bullets) {
        if (b.dead) continue;
        const hitR = (b.aoe > 0 ? 0.9 : 0.6) * Math.max(1, zb.scale * 0.8);
        if (Math.abs(b.z - zb.z) < hitR + 0.1 && Math.abs(b.x - zb.x) < hitR) {
          b.dead = true;
          zb.hp -= b.dmg;
          if (b.aoe > 0) {
            if (b.kind === 'rocket') {
              spawnBurst(b.x, 0.8, b.z, 0xff8a3a, 22, 7, 0.5);
              spawnBurst(b.x, 0.5, b.z, 0x555049, 10, 3, 0.7);
              sfx.explosion();
              state.shake = Math.min(0.4, state.shake + 0.06);
            } else if (Math.random() < 0.25) {
              spawnBurst(b.x, 0.7, b.z, 0xff9a3a, 6, 2.5, 0.3);
            }
            for (const other of zombies) {
              if (other === zb) continue;
              if (Math.hypot(other.x - b.x, other.z - b.z) < b.aoe) other.hp -= b.dmg;
            }
          }
          if (zb.hp <= 0) break;
        }
      }
    }
    if (zb.hp <= 0) {
      gore(zb.x, zb.z);
      sfx.zombieDie(Math.hypot(zb.x - squad.x, zb.z - squad.z));
      state.kills++;
      zombies.splice(i, 1);
      continue;
    }
    const jumpedClear = state.mode === 'side2d' && squad.y > 0.72;
    if (!jumpedClear && Math.abs(zb.z - squad.z) < 1.0 + squadRadius() * 0.6 &&
        Math.abs(zb.x - squad.x) < 0.9 + squadRadius() * 0.6) {
      zombies.splice(i, 1);
      spawnBurst(zb.x, 0.9, zb.z, state.shieldTime > 0 ? 0x58baff : 0xff5050, 14, 5, 0.4);
      loseSoldiers(t.contactLoss);
      if (state.phase === 'result') return;
    }
  }

  // 女妖诱捕的拖拽效果
  if (state.pullTime > 0) {
    state.pullTime -= dt;
    squad.targetX = THREE.MathUtils.clamp(
      squad.targetX + (state.pullX - squad.targetX) * Math.min(1, dt * 5),
      -SQUAD_X_LIMIT, SQUAD_X_LIMIT
    );
  }
  // AoE 溅射死亡统一清理
  for (let i = zombies.length - 1; i >= 0; i--) {
    if (zombies[i].hp <= 0) {
      gore(zombies[i].x, zombies[i].z);
      sfx.zombieDie(Math.hypot(zombies[i].x - squad.x, zombies[i].z - squad.z));
      state.kills++;
      zombies.splice(i, 1);
    }
  }

  // ---- Boss（边跑边打）
  for (let i = bosses.length - 1; i >= 0; i--) {
    const boss = bosses[i];
    const bossR = 2.2 * boss.mesh.scale.x;

    for (const b of bullets) {
      if (b.dead) continue;
      if (Math.abs(b.z - boss.z) < bossR && Math.abs(b.x - boss.x) < bossR) {
        b.dead = true;
        boss.hp -= b.dmg * (1 + relicBonus('bossDamage'));
        if (b.kind === 'rocket') {
          spawnBurst(b.x, 2, boss.z + bossR * 0.5, 0xff8a3a, 16, 5, 0.4);
          sfx.explosion();
        } else if (Math.random() < 0.3) {
          spawnBurst(b.x, 1.5 + Math.random() * 2, boss.z + bossR * 0.5, 0xffd24a, 5, 3, 0.25);
        }
      }
    }

    // 冰冻期间 Boss 完全停摆（仍然挨打）
    if (!frozen) {
      // 锚定在小队前方 ~7.5 处：远了就追，近了就随小队一起后撤，永远不会跑到身后
      const targetZ = squad.z - 7.5;
      const maxStep = (squad.speed + (boss.sideType === 'stalker' ? 6.5 : 3.5)) * dt;
      boss.z += THREE.MathUtils.clamp(targetZ - boss.z, -maxStep, maxStep);
      if (boss.z > squad.z - 4) boss.z = squad.z - 4; // 兜底：绝不越过小队
      const gap = boss.z - squad.z; // 负值 = boss 在前方
      boss.x += (squad.x * 0.7 - boss.x) * Math.min(1, dt * 1.6);

      boss.slamTimer -= dt;
      if (boss.slamTimer <= 0 && gap > -10) {
        boss.slamTimer = 1.5;
        const loss = Math.max(2, Math.round(state.count * 0.08));
        spawnBurst(squad.x, 0.8, squad.z - 1, 0xff5050, 22, 6, 0.5);
        loseSoldiers(loss);
        if (state.phase === 'result') return;
      }
      // 距离太远够不着时投掷兽颅
      boss.throwTimer -= dt;
      if (boss.throwTimer <= 0 && gap < -9) {
        boss.throwTimer = 2.6;
        throwSkull(boss.x, 3.6 * boss.mesh.scale.x, boss.z, 0.06);
        boss.mesh.userData.armR.rotation.x = -1.6; // 抡臂动作
      }
      // 锤击地面：双臂高举砸下，掀起扩散的震地波
      boss.hammerTimer -= dt;
      if (boss.hammerTimer <= 0 && gap > -16) {
        boss.hammerTimer = 6 + Math.random() * 2;
        boss.mesh.userData.armL.rotation.x = -2.4;
        boss.mesh.userData.armR.rotation.x = -2.4;
        spawnShockwave(boss.x, boss.z);
      }
      // 地刺：在小队预判路径上连布三丛尖刺
      boss.spikeTimer -= dt;
      if (boss.spikeTimer <= 0) {
        boss.spikeTimer = 7 + Math.random() * 2;
        for (let k = 0; k < 3; k++) {
          spawnSpikePatch(
            THREE.MathUtils.clamp(squad.x + (Math.random() - 0.5) * 4, -SQUAD_X_LIMIT, SQUAD_X_LIMIT),
            squad.z - 6 - k * 7
          );
        }
      }
      const t = Math.max(0, boss.slamTimer);
      boss.mesh.userData.armL.rotation.x = 0.5 + Math.sin(t * 8) * 0.9;
      boss.mesh.userData.armR.rotation.x = 0.5 + Math.cos(t * 8) * 0.9;

      const bossAltitude = boss.sideType === 'copter' ? 2.8 + Math.sin(time * 2.5) * 0.25 : Math.abs(Math.sin(time * 3)) * 0.1;
      boss.mesh.position.set(boss.x, bossAltitude, boss.z);
      boss.mesh.rotation.y = Math.atan2(squad.x - boss.x, squad.z - boss.z);
    }

    if (boss.hp <= 0) {
      spawnBurst(boss.x, 2.5, boss.z, 0xc01020, 40, 9, 0.9);
      spawnBurst(boss.x, 3.5, boss.z, 0xffd24a, 40, 9, 1.0);
      spawnBloodPool(boss.x, boss.z);
      scene.remove(boss.mesh);
      bosses.splice(i, 1);
      state.kills++;
      meta.stats.bossKills++;
      if (boss.sideType) state.runCoins += boss.coinReward;
      const undiscovered = Object.keys(RELICS).filter((key) => !meta.relics.includes(key));
      if (undiscovered.length && Math.random() < 0.65) {
        const relic = undiscovered[Math.floor(Math.random() * undiscovered.length)];
        meta.relics.push(relic);
        showBanner(`发现遗物 / ${RELICS[relic].name}`);
      }
      saveMeta(meta);
      // 击杀奖励：补充兵力
      const bonus = Math.round(8 + diff * 3);
      state.count = addSquad(state.count, bonus);
      state.maxCount = Math.max(state.maxCount, state.count);
      floatText(new THREE.Vector3(boss.x, 3, boss.z), `+${bonus} 增援!`, true);
      showBanner('BOSS 击破');
      sfx.levelUp();
    }
  }
}

// ============================================================ 渲染循环
const soldierAgents = [];
const timer = new THREE.Timer();
timer.connect(document);
const runnerCameraPos = new THREE.Vector3();
const sideCameraPos = new THREE.Vector3();
const runnerCameraLook = new THREE.Vector3();
const sideCameraLook = new THREE.Vector3();

function animate(timestamp) {
  requestAnimationFrame(animate);
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 0.05);
  const time = timer.getElapsed();
  updatePerformance(dt);

  updateChunks();

  if (state.phase === 'run') {
    updateRun(dt, time);
    updateBullets(dt);
    updateEnemyBullets(dt);
    updateSkulls(dt, time);
    updateShockwaves(dt);
    updateSpikePatches(dt, time);
    updateZapLines(dt);
    updateCoins(dt, time);
    perfState.weatherFlip = !perfState.weatherFlip;
    if (meta.settings.quality === 'high' || perfState.weatherFlip) updateWeather(dt * (meta.settings.quality === 'high' ? 1 : 2));
    if (perfState.hudTimer >= 0.1) {
      perfState.hudTimer = 0;
      updateHud();
    }
  }
  updateBursts(dt);
  updateBloodPools(dt);

  soldierAgents.length = 0;
  const renderN = Math.min(state.count, MAX_SOLDIER_RENDER);
  const scale = formationScale(renderN);
  for (let i = 0; i < renderN; i++) {
    soldierAgents.push({
      x: squad.x + unitSpiral[i].dx * scale,
      y: squad.y,
      z: squad.z + unitSpiral[i].dz * scale,
      rotY: 0,
      phase: i * 1.7,
      scale: 1,
    });
  }
  soldierCrowd.update(soldierAgents, time, 0.08, 11);
  soldierCrowd.setVisible(!state.vehicleId);
  if (state.vehicleId) {
    vehicleMesh.visible = true;
    vehicleMesh.position.set(squad.x, squad.y, squad.z);
    vehicleMesh.rotation.y = 0;
  }
  // 按类型分桶渲染僵尸；暗影芭比隐身期间不渲染
  for (const key of ZOMBIE_TYPE_KEYS) zombieBuckets[key].length = 0;
  for (const zb of zombies) {
    if (zb.hidden) continue;
    zombieBuckets[zb.type].push(zb);
  }
  for (const key of ZOMBIE_TYPE_KEYS) {
    zombieCrowds[key].update(zombieBuckets[key], time, 0.05, key === 'hunter' ? 9 : 7);
  }

  shieldMesh.visible = state.shieldTime > 0 && state.phase === 'run';
  if (shieldMesh.visible) {
    const r = squadRadius() + 1.1;
    shieldMesh.scale.set(r, r * 0.8, r);
    shieldMesh.position.set(squad.x, 0.6 + squad.y, squad.z);
    shieldMesh.material.opacity = 0.16 + Math.sin(time * 6) * 0.06;
  }

  state.shake = Math.max(0, state.shake - dt * 1.2);
  const shakeAmount = meta.settings.screenShake ? state.shake : 0;
  const shx = (Math.random() - 0.5) * shakeAmount;
  const shy = (Math.random() - 0.5) * shakeAmount;
  const targetMix = state.mode === 'side2d' ? 1 : 0;
  state.modeMix += (targetMix - state.modeMix) * Math.min(1, dt * 2.25);
  const portraitPullback = mobileViewport.portrait ? 1.34 : 1;
  runnerCameraPos.set(squad.x * 0.55 + shx, 8.8 * portraitPullback + shy, squad.z + 11 * portraitPullback);
  // 镜头位于道路边缘与建筑之间，避免侧视时穿入近侧楼体。
  sideCameraPos.set(7.6 * portraitPullback + shx, 4.9 * portraitPullback + shy, squad.z - 5);
  runnerCameraLook.set(squad.x * 0.55, 0.8 + squad.y, squad.z - 7);
  sideCameraLook.set(0, 1.45 + squad.y * 0.25, squad.z - 5);
  camera.position.lerpVectors(runnerCameraPos, sideCameraPos, state.modeMix);
  camera.lookAt(runnerCameraLook.lerp(sideCameraLook, state.modeMix));

  sun.position.set(squad.x + 12, 20, squad.z + 8);
  sun.target.position.set(squad.x, 0, squad.z - 5);
  rim.position.set(squad.x - 10, 9, squad.z - 16);
  rim.target.position.set(squad.x, 1.5, squad.z - 5);

  renderer.render(scene, camera);
}

animate();

// 调试接口（控制台可用：__dbg.spawnBoss() 等）
window.__dbg = { state, squad, spawnBoss, throwSkull, spawnWave, applyPickup, get bosses() { return bosses; } };
