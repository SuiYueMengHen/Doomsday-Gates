import * as THREE from 'three';

const _dummy = new THREE.Object3D();

/**
 * 用若干 InstancedMesh"零件"批量渲染一群小人（士兵/僵尸），
 * 每个个体只需提供 { x, z, rotY, phase, scale }，整体每帧只有几个 draw call。
 */
export class CrowdRenderer {
  constructor(scene, parts, maxCount) {
    this.maxCount = maxCount;
    this.meshes = parts.map((p) => {
      const mesh = new THREE.InstancedMesh(p.geometry, p.material, maxCount);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.userData.local = new THREE.Matrix4().compose(
        new THREE.Vector3(...p.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rotation ?? [0, 0, 0]))),
        new THREE.Vector3(...(p.scale ?? [1, 1, 1]))
      );
      scene.add(mesh);
      return mesh;
    });
  }

  update(agents, time, bobAmp = 0.07, bobSpeed = 10) {
    const n = Math.min(agents.length, this.maxCount);
    for (const mesh of this.meshes) mesh.count = n;
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = agents[i];
      const bob = Math.abs(Math.sin(time * bobSpeed + a.phase)) * bobAmp;
      _dummy.position.set(a.x, (a.y ?? 0) + bob, a.z);
      _dummy.rotation.set(Math.sin(time * bobSpeed + a.phase) * 0.06, a.rotY ?? 0, 0);
      const s = a.scale ?? 1;
      _dummy.scale.set(s, s, s);
      _dummy.updateMatrix();
      for (const mesh of this.meshes) {
        m.multiplyMatrices(_dummy.matrix, mesh.userData.local);
        mesh.setMatrixAt(i, m);
      }
    }
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }

  setVisible(v) {
    for (const mesh of this.meshes) mesh.visible = v;
  }
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const capsule = (radius, length, segments = 6) => new THREE.CapsuleGeometry(radius, length, 4, segments);
const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({
  color,
  roughness: 0.72,
  metalness: 0.06,
  flatShading: true,
  ...opts,
});

export function soldierParts() {
  const uniform = mat(0x26384a);
  const armor = mat(0x3e86b8, { roughness: 0.48, metalness: 0.22 });
  const dark = mat(0x101820, { roughness: 0.38, metalness: 0.38 });
  const skin = mat(0xc89570, { roughness: 0.88 });
  return [
    { geometry: capsule(0.09, 0.22), material: uniform, position: [-0.13, 0.26, 0] },
    { geometry: capsule(0.09, 0.22), material: uniform, position: [0.13, 0.26, 0] },
    { geometry: box(0.18, 0.12, 0.28), material: dark, position: [-0.13, 0.07, -0.035] },
    { geometry: box(0.18, 0.12, 0.28), material: dark, position: [0.13, 0.07, -0.035] },
    { geometry: new THREE.CylinderGeometry(0.22, 0.27, 0.4, 8), material: uniform, position: [0, 0.6, 0] },
    { geometry: box(0.48, 0.27, 0.31), material: armor, position: [0, 0.64, -0.035] },
    { geometry: box(0.5, 0.07, 0.31), material: dark, position: [0, 0.43, 0] },
    { geometry: capsule(0.075, 0.28), material: uniform, position: [-0.3, 0.6, -0.04], rotation: [0.25, 0, -0.12] },
    { geometry: capsule(0.075, 0.28), material: uniform, position: [0.3, 0.6, -0.04], rotation: [0.65, 0, 0.18] },
    { geometry: new THREE.SphereGeometry(0.16, 12, 8), material: skin, position: [0, 0.92, -0.015] },
    { geometry: new THREE.SphereGeometry(0.19, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.58), material: armor, position: [0, 1.01, 0] },
    { geometry: box(0.3, 0.06, 0.22), material: dark, position: [0, 0.96, -0.13] },
    { geometry: box(0.09, 0.1, 0.62), material: dark, position: [0.17, 0.64, -0.25], rotation: [0.08, 0, 0] },
    { geometry: box(0.32, 0.36, 0.14), material: mat(0x1d2b34), position: [0, 0.66, 0.2] },
  ];
}

export function zombieParts(palette = {}) {
  const {
    legs = 0x3d4a2c,
    torso = 0x5c8a3c,
    head = 0x8fc46a,
    arms = 0x74a84e,
  } = palette;
  const rotten = mat(head, { roughness: 1 });
  const cloth = mat(torso, { roughness: 0.95 });
  const eye = mat(0xff493d, { emissive: 0xff160d, emissiveIntensity: 1.6, roughness: 0.2 });
  return [
    { geometry: capsule(0.1, 0.24), material: mat(legs), position: [-0.14, 0.27, 0], rotation: [0, 0, -0.08] },
    { geometry: capsule(0.1, 0.24), material: mat(legs), position: [0.14, 0.27, 0], rotation: [0, 0, 0.12] },
    { geometry: new THREE.CylinderGeometry(0.23, 0.3, 0.46, 7), material: cloth, position: [0, 0.65, 0], rotation: [0.18, 0, 0.08] },
    { geometry: box(0.56, 0.12, 0.34), material: mat(arms), position: [0, 0.78, 0], rotation: [0.12, 0, 0.05] },
    { geometry: new THREE.SphereGeometry(0.185, 9, 7), material: rotten, position: [0.03, 1.02, -0.07], rotation: [0.18, 0, -0.12] },
    { geometry: box(0.25, 0.13, 0.2), material: rotten, position: [0.03, 0.91, -0.17], rotation: [0.2, 0, 0] },
    { geometry: capsule(0.07, 0.34), material: mat(arms), position: [-0.28, 0.71, -0.28], rotation: [Math.PI / 2.35, 0, -0.12] },
    { geometry: capsule(0.07, 0.34), material: mat(arms), position: [0.29, 0.72, -0.3], rotation: [Math.PI / 2.2, 0, 0.13] },
    { geometry: new THREE.SphereGeometry(0.035, 6, 4), material: eye, position: [-0.035, 1.06, -0.23] },
    { geometry: new THREE.SphereGeometry(0.035, 6, 4), material: eye, position: [0.095, 1.06, -0.23] },
  ];
}

/** 被感染的士兵僵尸：残破军装 + 病变绿皮肤，仍然端着枪 */
export function infectedSoldierParts() {
  const parts = soldierParts();
  const infectedMats = [
    mat(0x29322c), mat(0x29322c), mat(0x171d1a), mat(0x171d1a),
    mat(0x334a3d), mat(0x456552), mat(0x1c241f), mat(0x617a58),
    mat(0x617a58), mat(0x7da65f), mat(0x34483b), mat(0x191f1b),
    mat(0x171a18, { metalness: 0.45 }), mat(0x26342c),
  ];
  return parts.map((part, i) => ({ ...part, material: infectedMats[i] }));
}

/** 士兵编队偏移：黄金角螺旋，队形紧凑均匀 */
export function formationOffsets(max) {
  const offsets = [];
  for (let i = 0; i < max; i++) {
    const r = 0.62 * Math.sqrt(i);
    const a = i * 2.39996;
    offsets.push({ dx: Math.cos(a) * r, dz: Math.sin(a) * r });
  }
  return offsets;
}
