/*
  Models for blocks, block decorations and props. All built in code.
  Block-space: a cell is 1x1x1 centred on the origin; the front face is at +z.
*/

import * as pc from 'playcanvas';
import { Rng } from '../core/rng.js';
import { geo, append, merge, trs, prim, toMesh, roundedBox, rock, crystal, flatten } from './geometry.js';

const VARIANTS = 3;

// Quad facing +z with UVs scaled to world units (for tiling textures)
export function quad(x0, y0, x1, y1, z, uvScale = 0.5, normal = [0, 0, 1]) {
  const g = geo();
  g.positions.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z);
  for (let i = 0; i < 4; i++) g.normals.push(...normal);
  g.uvs.push(x0 * uvScale, -y0 * uvScale, x1 * uvScale, -y0 * uvScale, x1 * uvScale, -y1 * uvScale, x0 * uvScale, -y1 * uvScale);
  g.indices.push(0, 1, 2, 0, 2, 3);
  return g;
}

// Box whose UVs follow world size, so long beams don't stretch textures
export function boxUV(hx, hy, hz, uvScale = 1) {
  const g = geo();
  const faces = [
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0], hu: hx, hv: hy, d: hz },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, -1, 0], hu: hx, hv: hy, d: hz },
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, -1, 0], hu: hz, hv: hy, d: hx },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, -1, 0], hu: hz, hv: hy, d: hx },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], hu: hx, hv: hz, d: hy },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1], hu: hx, hv: hz, d: hy }
  ];
  for (const f of faces) {
    const base = g.positions.length / 3;
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = f.n[0] * f.d + f.u[0] * su * f.hu + f.v[0] * sv * f.hv;
      const y = f.n[1] * f.d + f.u[1] * su * f.hu + f.v[1] * sv * f.hv;
      const z = f.n[2] * f.d + f.u[2] * su * f.hu + f.v[2] * sv * f.hv;
      g.positions.push(x, y, z);
      g.normals.push(...f.n);
      g.uvs.push(su * f.hu * uvScale, sv * f.hv * uvScale);
    }
    // winding: counter-clockwise when looking against the normal
    const [a, b, c, d] = [base, base + 1, base + 2, base + 3];
    const p = g.positions;
    const e1 = [p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]];
    const e2 = [p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (cr[0] * f.n[0] + cr[1] * f.n[1] + cr[2] * f.n[2] >= 0) g.indices.push(a, b, c, a, c, d);
    else g.indices.push(a, c, b, a, d, c);
  }
  return g;
}

// Points scattered over the front face, kept apart from each other
function scatter(rng, count, spread = 0.3, minDist = 0.17) {
  const pts = [];
  for (let tries = 0; pts.length < count && tries < 200; tries++) {
    const p = { x: rng.float(-spread, spread), y: rng.float(-spread, spread) };
    if (pts.every(q => Math.hypot(q.x - p.x, q.y - p.y) >= minDist)) pts.push(p);
  }
  return pts;
}

function lumps(seed, count, rMin, rMax, detail, jitter, depth = 0.44) {
  const rng = new Rng(seed);
  const parts = [];
  for (const p of scatter(rng, count, 0.3, rMax * 1.45)) {
    const r = rng.float(rMin, rMax);
    parts.push([rock(rng.int(1, 1e6), r, detail, jitter, [1, rng.float(0.75, 1.1), 0.75]),
      trs(p.x, p.y, depth, rng.float(0, 360), rng.float(0, 360), rng.float(0, 360))]);
  }
  return merge(parts);
}

function crystals(seed, count, rMin, rMax, lenMin, lenMax) {
  const rng = new Rng(seed);
  const parts = [];
  const pts = scatter(rng, count, 0.22, 0.14);
  pts.forEach((p, i) => {
    const big = i === 0;
    const r = big ? rMax : rng.float(rMin, rMax * 0.8);
    const len = big ? lenMax : rng.float(lenMin, lenMax * 0.8);
    // crystals grow out of the face (+z) with a random lean
    parts.push([crystal(r, len, r * 1.2), trs(p.x, p.y, 0.36, 90 + rng.float(-35, 35), 0, rng.float(-35, 35))]);
  });
  return merge(parts);
}

export class ModelLibrary {
  constructor(device) {
    this.device = device;
    this.meshes = {};
    this.build();
  }

  add(name, g, tangents = false) {
    this.meshes[name] = toMesh(this.device, g, { tangents });
    return this.meshes[name];
  }

  get(name) {
    const m = this.meshes[name];
    if (!m) throw new Error(`Unknown mesh ${name}`);
    return m;
  }

  build() {
    // Block bodies
    this.add('cube', roundedBox(0.49, 0.09, 3), true);
    this.add('cubeRough', roundedBox(0.49, 0.15, 3), true);
    this.add('cubeSharp', roundedBox(0.49, 0.035, 2), true);
    this.add('slab', roundedBox(0.5, 0.06, 2), true);

    for (let v = 0; v < VARIANTS; v++) {
      this.add(`coal${v}`, lumps(10 + v, 6, 0.11, 0.17, 0, 0.25, 0.42));
      this.add(`iron${v}`, lumps(20 + v, 7, 0.08, 0.13, 1, 0.22, 0.45));
      this.add(`gold${v}`, lumps(30 + v, 7, 0.08, 0.135, 1, 0.18, 0.46));
      this.add(`diamond${v}`, crystals(40 + v, 4, 0.065, 0.1, 0.18, 0.34));
      this.add(`gem${v}`, crystals(50 + v, 3, 0.08, 0.13, 0.2, 0.38));
      this.add(`boulder${v}`, rock(60 + v, 0.47, 1, 0.1, [1, 0.94, 0.9]), true);
    }

    this.buildItems();
    this.buildBlockExtras();
  }

  buildItems() {
    // Torch stuck into the dirt, unlit
    this.add('torchStick', merge([[prim.cylinder(0.035, 0.55, 8), trs(0.04, 0.02, 0.42, 55, 0, -25)]]));
    this.add('torchHead', merge([[prim.cylinder(0.07, 0.15, 10), trs(0.13, 0.2, 0.64, 55, 0, -25)]]));

    // Pickaxe: wooden handle with a curved iron head
    const head = geo();
    append(head, prim.cone(0.045, 0.012, 0.28, 8), trs(0.14, 0, 0, 0, 0, -100));
    append(head, prim.cone(0.045, 0.012, 0.28, 8), trs(-0.14, 0, 0, 0, 0, 100));
    append(head, prim.box(0.06, 0.05, 0.05), trs(0, 0, 0));
    const pickTransform = trs(0, 0.02, 0.5, 30, 0, 35);
    this.add('pickHandle', merge([[prim.cylinder(0.03, 0.62, 8), pickTransform.clone().mul(trs(0, -0.06, 0))]]));
    this.add('pickHead', merge([[head, pickTransform.clone().mul(trs(0, 0.25, 0))]]));

    // Hard hat (also used on the miner)
    this.add('hatDome', merge([[prim.sphere(0.24, 10, 16), trs(0, 0, 0, 0, 0, 0, 1, 0.8, 1)]]));
    this.add('hatBrim', merge([[prim.cylinder(0.3, 0.035, 20), trs(0, -0.02, 0.03)]]));
    this.add('hatLamp', merge([[prim.cylinder(0.065, 0.07, 12), trs(0, 0.06, 0.24, 90, 0, 0)]]));
    this.add('hatLens', merge([[prim.cylinder(0.05, 0.02, 12), trs(0, 0.06, 0.28, 90, 0, 0)]]));

    // Flare stick
    this.add('flareBody', merge([[prim.cylinder(0.05, 0.38, 10), trs(0, 0, 0.45, 60, 0, 30)]]));
    this.add('flareCap', merge([[prim.cylinder(0.055, 0.08, 10), trs(0.1, 0.16, 0.54, 60, 0, 30)]]));

    // Chest
    const chestWood = geo();
    append(chestWood, prim.box(0.24, 0.13, 0.15), trs(0, -0.06, 0));
    append(chestWood, prim.cylinder(0.15, 0.48, 12), trs(0, 0.07, 0, 0, 0, 90, 1, 1, 1));
    const chestTrim = geo();
    append(chestTrim, prim.box(0.03, 0.2, 0.16), trs(-0.15, 0, 0));
    append(chestTrim, prim.box(0.03, 0.2, 0.16), trs(0.15, 0, 0));
    append(chestTrim, prim.box(0.05, 0.06, 0.02), trs(0, 0.01, 0.16));
    const chestT = trs(0, -0.04, 0.38, -8, 12, 0);
    this.add('chestWood', merge([[chestWood, chestT]]));
    this.add('chestTrim', merge([[chestTrim, chestT]]));

    // Hard hat as a block item
    const hatT = trs(0, -0.02, 0.42, 20, 0, 12);
    this.add('itemHatDome', merge([[prim.sphere(0.24, 10, 16), hatT.clone().mul(trs(0, 0, 0, 0, 0, 0, 1, 0.8, 1))]]));
    this.add('itemHatBrim', merge([[prim.cylinder(0.3, 0.035, 20), hatT.clone().mul(trs(0, -0.02, 0.03))]]));
    this.add('itemHatLamp', merge([[prim.cylinder(0.065, 0.07, 12), hatT.clone().mul(trs(0, 0.06, 0.24, 90, 0, 0))]]));
  }

  buildBlockExtras() {
    // TNT fuse curling from the top
    const fuse = geo();
    let x = 0.12;
    let y = 0.48;
    let z = 0.1;
    for (let i = 0; i < 5; i++) {
      append(fuse, prim.cylinder(0.018, 0.07, 6), trs(x, y, z, 15 * i, 0, -20 - i * 12));
      x += 0.02 + i * 0.006;
      y += 0.055 - i * 0.006;
      z += 0.01;
    }
    this.add('tntFuse', fuse);

    // Iron straps around reinforced stone
    const straps = geo();
    for (const y of [-0.24, 0.24]) {
      append(straps, prim.box(0.505, 0.045, 0.505), trs(0, y, 0));
    }
    for (const sx of [-0.33, 0, 0.33]) {
      for (const y of [-0.24, 0.24]) {
        append(straps, prim.sphere(0.03, 6, 8), trs(sx, y, 0.505));
      }
    }
    this.add('straps', straps);

    // Grass cap with tufts for the top row
    const cap = geo();
    append(cap, roundedBox(0.5, 0.05, 2), trs(0, 0.45, 0, 0, 0, 0, 1.01, 0.18, 1.01));
    this.add('grassCap', cap);
    const rng = new Rng(5);
    const tufts = geo();
    for (let i = 0; i < 9; i++) {
      const tx = rng.float(-0.42, 0.42);
      const tz = rng.float(-0.2, 0.45);
      append(tufts, prim.cone(0.035, 0, rng.float(0.1, 0.2), 4), trs(tx, 0.58, tz, rng.float(-15, 15), 0, rng.float(-25, 25)));
    }
    this.add('grassTufts', flatten(tufts));

    // Camera-facing glow sprite (headlamp halo)
    this.add('haloQuad', quad(-0.5, -0.5, 0.5, 0.5, 0, 1));
    this.meshes.haloQuad.setUvs(0, [0, 1, 1, 1, 1, 0, 0, 0]);
    this.meshes.haloQuad.update(pc.PRIMITIVE_TRIANGLES);

    // Cracks overlay on the front face
    this.add('crackQuad', quad(-0.5, -0.5, 0.5, 0.5, 0.505, 1));
    const cq = this.meshes.crackQuad;
    // remap UVs to 0..1 for the non-tiling crack texture
    cq.setUvs(0, [0, 1, 1, 1, 1, 0, 0, 0]);
    cq.update(pc.PRIMITIVE_TRIANGLES);
  }
}

export const MESH_VARIANTS = VARIANTS;
