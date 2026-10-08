/*
  Particles - all particles of a kind are drawn in a single dynamic mesh.
  - add:    camera-facing glowing sprites (sparks, embers, sparkles)
  - alpha:  camera-facing soft sprites (dust, smoke), lit by the scene
  - debris: small tumbling cubes (rock chunks)
*/

import * as pc from 'playcanvas';
import { Mask } from './masks.js';

const CUBE = (() => {
  const g = new pc.BoxGeometry({ halfExtents: new pc.Vec3(0.5, 0.5, 0.5) });
  return { positions: Array.from(g.positions), normals: Array.from(g.normals), indices: Array.from(g.indices) };
})();

function packColor(r, g, b, a) {
  const R = Math.max(0, Math.min(255, r * 255)) | 0;
  const G = Math.max(0, Math.min(255, g * 255)) | 0;
  const B = Math.max(0, Math.min(255, b * 255)) | 0;
  const A = Math.max(0, Math.min(255, a * 255)) | 0;
  return (A << 24) | (B << 16) | (G << 8) | R;
}

class Batch {
  constructor(device, layer, material, max, kind, mask) {
    this.max = max;
    this.kind = kind;
    this.items = [];
    const vertsPer = kind === 'debris' ? 24 : 4;
    const indicesPer = kind === 'debris' ? 36 : 6;
    this.vertsPer = vertsPer;
    this.indicesPer = indicesPer;
    this.positions = new Float32Array(max * vertsPer * 3);
    this.normals = new Float32Array(max * vertsPer * 3);
    this.colors = new Uint32Array(max * vertsPer);
    this.colorBytes = new Uint8Array(this.colors.buffer);
    this.uvs = new Float32Array(max * vertsPer * 2);
    const indices = new Uint16Array(max * indicesPer);
    for (let i = 0; i < max; i++) {
      if (kind === 'debris') {
        for (let k = 0; k < 36; k++) indices[i * 36 + k] = CUBE.indices[k] + i * 24;
      } else {
        const v = i * 4;
        indices.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
        this.uvs.set([0, 1, 1, 1, 1, 0, 0, 0], i * 8);
      }
    }
    if (kind !== 'debris') {
      for (let i = 0; i < max * 4; i++) this.normals[i * 3 + 2] = 1;
    }
    this.indices = indices;

    const mesh = new pc.Mesh(device);
    mesh.clear(true, false, max * vertsPer, max * indicesPer);
    mesh.setPositions(this.positions);
    mesh.setNormals(this.normals);
    mesh.setUvs(0, this.uvs);
    mesh.setColors32(this.colorBytes, max * vertsPer);
    mesh.setIndices(indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES, false);
    this.mesh = mesh;
    this.node = new pc.GraphNode();
    this.mi = new pc.MeshInstance(mesh, material, this.node);
    this.mi.cull = false;
    this.mi.mask = mask;
    this.mi.drawOrder = kind === 'add' ? 20 : 10;
    layer.addMeshInstances([this.mi]);
  }

  add(p) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push(p);
  }

  update(dt, right, up) {
    const items = this.items;
    let w = 0;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vy -= p.gravity * dt;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.vz *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.spin * dt;
      if (p.floor !== undefined && p.y < p.floor) {
        p.y = p.floor;
        p.vy *= -0.3;
        p.vx *= 0.6;
        p.spin *= 0.5;
      }
      items[w++] = p;
    }
    items.length = w;

    const pos = this.positions;
    const col = this.colors;
    const nrm = this.normals;
    for (let i = 0; i < w; i++) {
      const p = items[i];
      const k = p.life / p.max;
      const size = p.size + (p.size1 - p.size) * k;
      const fadeIn = p.fadeIn ? Math.min(1, p.life / p.fadeIn) : 1;
      const alpha = p.a * (1 - Math.pow(k, p.fadePow)) * fadeIn;
      const r = p.r + (p.r1 - p.r) * k;
      const g = p.g + (p.g1 - p.g) * k;
      const b = p.b + (p.b1 - p.b) * k;

      if (this.kind === 'debris') {
        const c = packColor(r, g, b, 1);
        const cs = Math.cos(p.rot);
        const sn = Math.sin(p.rot);
        const s = size * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
        for (let v = 0; v < 24; v++) {
          const ox = CUBE.positions[v * 3] * s;
          const oy = CUBE.positions[v * 3 + 1] * s;
          const oz = CUBE.positions[v * 3 + 2] * s;
          // spin around a tilted axis (x then z)
          const y1 = oy * cs - oz * sn;
          const z1 = oy * sn + oz * cs;
          const x2 = ox * cs - y1 * sn;
          const y2 = ox * sn + y1 * cs;
          const idx = (i * 24 + v) * 3;
          pos[idx] = p.x + x2;
          pos[idx + 1] = p.y + y2;
          pos[idx + 2] = p.z + z1;
          const nx = CUBE.normals[v * 3];
          const ny = CUBE.normals[v * 3 + 1];
          const nz = CUBE.normals[v * 3 + 2];
          const ny1 = ny * cs - nz * sn;
          const nz1 = ny * sn + nz * cs;
          nrm[idx] = nx * cs - ny1 * sn;
          nrm[idx + 1] = nx * sn + ny1 * cs;
          nrm[idx + 2] = nz1;
          col[i * 24 + v] = c;
        }
      } else {
        const c = this.kind === 'add' ? packColor(r * alpha, g * alpha, b * alpha, 1) : packColor(r, g, b, alpha);
        const cs = Math.cos(p.rot) * size;
        const sn = Math.sin(p.rot) * size;
        // rotated corner offsets in the camera plane
        const ax = right.x * cs + up.x * sn;
        const ay = right.y * cs + up.y * sn;
        const az = right.z * cs + up.z * sn;
        const bx = -right.x * sn + up.x * cs;
        const by = -right.y * sn + up.y * cs;
        const bz = -right.z * sn + up.z * cs;
        const o = i * 12;
        pos[o] = p.x - ax - bx;
        pos[o + 1] = p.y - ay - by;
        pos[o + 2] = p.z - az - bz;
        pos[o + 3] = p.x + ax - bx;
        pos[o + 4] = p.y + ay - by;
        pos[o + 5] = p.z + az - bz;
        pos[o + 6] = p.x + ax + bx;
        pos[o + 7] = p.y + ay + by;
        pos[o + 8] = p.z + az + bz;
        pos[o + 9] = p.x - ax + bx;
        pos[o + 10] = p.y - ay + by;
        pos[o + 11] = p.z - az + bz;
        col[i * 4] = c;
        col[i * 4 + 1] = c;
        col[i * 4 + 2] = c;
        col[i * 4 + 3] = c;
      }
    }

    const verts = w * this.vertsPer;
    this.mi.visible = w > 0;
    if (w === 0) return;
    this.mesh.setPositions(pos, 3, verts);
    this.mesh.setNormals(nrm, 3, verts);
    this.mesh.setUvs(0, this.uvs, 2, verts);
    this.mesh.setColors32(this.colorBytes, verts);
    this.mesh.setIndices(this.indices, w * this.indicesPer);
    this.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
  }
}

function makeParticle(o) {
  return {
    x: o.x, y: o.y, z: o.z ?? 0.6,
    vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0,
    life: 0, max: o.life ?? 1,
    size: o.size ?? 0.1, size1: o.size1 ?? o.size ?? 0.1,
    r: o.color[0], g: o.color[1], b: o.color[2],
    r1: (o.color1 || o.color)[0], g1: (o.color1 || o.color)[1], b1: (o.color1 || o.color)[2],
    a: o.alpha ?? 1, fadePow: o.fadePow ?? 2, fadeIn: o.fadeIn ?? 0,
    gravity: o.gravity ?? 0, drag: o.drag ?? 0,
    rot: o.rot ?? Math.random() * Math.PI * 2, spin: o.spin ?? 0,
    floor: o.floor
  };
}

export function hexColor(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class Particles {
  constructor(device, layer, materials) {
    this.scale = 1;
    this.add = new Batch(device, layer, materials.get('fxAdd'), 700, 'add', Mask.PLAYFIELD);
    this.alpha = new Batch(device, layer, materials.get('fxAlpha'), 400, 'alpha', Mask.PLAYFIELD);
    this.debris = new Batch(device, layer, materials.get('fxDebris'), 220, 'debris', Mask.PLAYFIELD);
  }

  setQuality(scale) {
    this.scale = scale;
  }

  count(n) {
    return Math.max(1, Math.round(n * this.scale));
  }

  spark(o) {
    this.add.add(makeParticle(o));
  }

  puff(o) {
    this.alpha.add(makeParticle(o));
  }

  chunk(o) {
    this.debris.add(makeParticle(o));
  }

  clear() {
    this.add.items.length = 0;
    this.alpha.items.length = 0;
    this.debris.items.length = 0;
  }

  update(dt, camera) {
    const right = camera.right;
    const up = camera.up;
    this.add.update(dt, right, up);
    this.alpha.update(dt, right, up);
    this.debris.update(dt, right, up);
  }
}
