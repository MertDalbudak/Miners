/*
  Blocks view - renders the grid with hardware instancing.

  Every (mesh, material) pair is one instanced draw call. Static rows are
  cached and only rebuilt when the grid row changes; animated cells (shaking,
  wobbling, popping) are rebuilt every frame.
*/

import * as pc from 'playcanvas';
import { B } from '../game/blocks.js';
import { BIOMES, biomeIndexAt } from '../game/biomes.js';
import { depthOfRow } from '../game/levelgen.js';
import { cellNoise } from '../core/rng.js';
import { GameConfig } from '../config.js';
import { Mask } from './masks.js';

const COLS = GameConfig.COLS;

export function cellX(c) {
  return c - (COLS - 1) / 2;
}

export function cellY(r) {
  return GameConfig.SURFACE_ROWS - r - 0.5;
}

export function rowAtY(y) {
  return GameConfig.SURFACE_ROWS - 0.5 - y;
}

class InstanceGroup {
  constructor(device, layer, mesh, material, mask) {
    this.device = device;
    this.capacity = 32;
    this.data = new Float32Array(this.capacity * 16);
    this.count = 0;
    this.node = new pc.GraphNode();
    this.mi = new pc.MeshInstance(mesh, material, this.node);
    this.mi.mask = mask;
    this.mi.cull = false;
    this.vb = null;
    this.createBuffer();
    layer.addMeshInstances([this.mi]);
  }

  createBuffer() {
    if (this.vb) this.vb.destroy();
    const format = pc.VertexFormat.getDefaultInstancingFormat(this.device);
    this.vb = new pc.VertexBuffer(this.device, format, this.capacity, { usage: pc.BUFFER_DYNAMIC, data: this.data });
    this.mi.setInstancing(this.vb);
  }

  begin() {
    this.count = 0;
  }

  push(m) {
    if (this.count >= this.capacity) {
      this.capacity *= 2;
      const data = new Float32Array(this.capacity * 16);
      data.set(this.data);
      this.data = data;
      this.createBuffer();
    }
    this.data.set(m, this.count * 16);
    this.count++;
  }

  end() {
    if (this.count > 0) this.vb.setData(this.data);
    this.mi.instancingCount = this.count;
    this.mi.visible = this.count > 0;
  }
}

const NO_ANIM = { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0, s: 1 };
const tmpMat = new pc.Mat4();
const tmpPos = new pc.Vec3();
const tmpRot = new pc.Quat();
const tmpScale = new pc.Vec3();

export class BlocksView {
  constructor(device, layer, materials, models) {
    this.device = device;
    this.layer = layer;
    this.materials = materials;
    this.models = models;
    this.groups = new Map();
    this.rowCache = new Map();
    this.animated = new Map(); // cellKey -> { kind, t, duration, ... }
    this.ghosts = []; // blocks that were just removed and shrink away
    this.game = null;
    this.scratch = [];
  }

  setGame(game) {
    this.game = game;
    this.rowCache.clear();
    this.animated.clear();
    this.ghosts.length = 0;
  }

  key(c, r) {
    return r * 16 + c;
  }

  group(mesh, material, mask = Mask.PLAYFIELD) {
    const k = `${mesh}|${material}|${mask}`;
    let g = this.groups.get(k);
    if (!g) {
      g = new InstanceGroup(this.device, this.layer, this.models.get(mesh), this.materials.get(material), mask);
      this.groups.set(k, g);
    }
    return g;
  }

  // ------------------------------------------------------------ animations

  shake(c, r, strength = 1, duration = 0.28) {
    this.animated.set(this.key(c, r), { kind: 'shake', c, r, t: 0, duration, strength });
  }

  wobble(c, r) {
    this.animated.set(this.key(c, r), { kind: 'wobble', c, r, t: 0, duration: Infinity, strength: 1 });
  }

  stopAnim(c, r) {
    this.animated.delete(this.key(c, r));
  }

  hide(c, r) {
    this.animated.set(this.key(c, r), { kind: 'hidden', c, r, t: 0, duration: Infinity });
  }

  pop(c, r, type, variant, duration = 0.22) {
    if (type === B.EMPTY || type === B.BOULDER) return;
    this.ghosts.push({ c, r, type, variant, t: 0, duration });
  }

  animOffsets(a) {
    const t = a.t;
    if (a.kind === 'shake') {
      const k = (1 - t / a.duration) * a.strength;
      return { ...NO_ANIM, dx: Math.sin(t * 70) * 0.06 * k, dy: Math.cos(t * 55) * 0.03 * k, s: 1 - 0.04 * k };
    }
    if (a.kind === 'wobble') {
      return { ...NO_ANIM, dx: Math.sin(t * 38) * 0.04, rz: Math.sin(t * 30) * 7, dy: Math.abs(Math.sin(t * 19)) * 0.03 };
    }
    return NO_ANIM;
  }

  // ------------------------------------------------------------ description

  makePart(c, r, mesh, material, rotZ, anim, extra = null, mask = Mask.PLAYFIELD) {
    tmpPos.set(cellX(c) + anim.dx, cellY(r) + anim.dy, anim.dz);
    tmpRot.setFromEulerAngles(anim.rx, anim.ry, rotZ + anim.rz);
    tmpScale.set(anim.s, anim.s, anim.s);
    tmpMat.setTRS(tmpPos, tmpRot, tmpScale);
    if (extra) tmpMat.mul(extra);
    return { c, group: this.group(mesh, material, mask), m: new Float32Array(tmpMat.data) };
  }

  describe(c, r, type, variant, hp, out, anim = NO_ANIM) {
    if (type === B.EMPTY) return;
    const biome = BIOMES[biomeIndexAt(depthOfRow(r))].key;
    const soil = (cellNoise(c, r, 1) < 0.5 ? 'soil_' : 'soil2_') + biome;
    const ore = `ore_${biome}`;
    const v = Math.floor(cellNoise(c, r, 2) * 3);
    const rot = Math.floor(cellNoise(c, r, 3) * 4) * 90;
    const decoRot = (cellNoise(c, r, 4) - 0.5) * 60;
    const add = (mesh, mat, rz = rot) => out.push(this.makePart(c, r, mesh, mat, rz, anim));

    switch (type) {
      case B.DIRT:
        add('cube', soil);
        if (r === GameConfig.SURFACE_ROWS) {
          add('grassCap', 'grasscap', 0);
          add('grassTufts', 'leaves', 0);
        }
        break;
      case B.COAL:
        add('cube', ore);
        add(`coal${v}`, 'coal', decoRot);
        break;
      case B.IRON:
        add('cube', ore);
        add(`iron${v}`, 'iron', decoRot);
        break;
      case B.GOLD:
        add('cube', ore);
        add(`gold${v}`, 'gold', decoRot);
        break;
      case B.DIAMOND:
        add('cube', ore);
        add(`diamond${v}`, 'diamond', decoRot);
        break;
      case B.GEM:
        add('cube', ore);
        add(`gem${v}`, `gem${variant}`, decoRot);
        break;
      case B.STONE:
        add('cubeRough', 'stone');
        break;
      case B.HARDSTONE:
        add('cube', 'hardstone');
        add('straps', 'rust', 0);
        break;
      case B.OBSIDIAN:
        add('cubeSharp', 'obsidian');
        break;
      case B.MAGMA:
        add('cube', 'magma');
        break;
      case B.TNT:
        add('cube', 'tnt', 0);
        add('tntFuse', 'fuse', 0);
        break;
      case B.TORCH:
        add('cube', ore);
        add('torchSconce', 'darkmetal', 0);
        add('torchStick', 'plainwood', 0);
        add('torchHead', 'clothDark', 0);
        break;
      case B.PICKAXE:
        add('cube', soil);
        add('pickHandle', 'plainwood', 0);
        add('pickHead', 'metal', 0);
        break;
      case B.SHIELD:
        add('cube', soil);
        add('itemHatDome', 'hat', 0);
        add('itemHatBrim', 'hat', 0);
        add('itemHatLamp', 'darkmetal', 0);
        break;
      case B.FLARE:
        add('cube', soil);
        add('flareBody', 'flare', 0);
        add('flareCap', 'white', 0);
        break;
      case B.CHEST:
        add('cube', soil);
        add('chestWood', 'wood', 0);
        add('chestTrim', 'chestgold', 0);
        break;
      case B.BOULDER:
        add(`boulder${v}`, 'boulder', decoRot);
        break;
    }

    // Damage cracks on hard blocks
    if (type === B.HARDSTONE || type === B.OBSIDIAN) {
      const max = type === B.HARDSTONE ? 2 : 3;
      if (hp < max) add('crackQuad', hp <= 1 ? 'cracks2' : 'cracks1', 0);
    }
  }

  rebuildRow(r, row) {
    const parts = [];
    for (let c = 0; c < COLS; c++) {
      this.describe(c, r, row.type[c], row.variant[c], row.hp[c], parts);
    }
    const cache = { version: row.version, parts };
    this.rowCache.set(r, cache);
    return cache;
  }

  // ----------------------------------------------------------------- update

  update(dt, topRow, bottomRow) {
    if (!this.game) return;
    const grid = this.game.grid;
    for (const g of this.groups.values()) g.begin();

    const animating = this.animated.size > 0;
    for (let r = topRow; r <= bottomRow; r++) {
      const row = grid.rows.get(r);
      if (!row) continue;
      let cache = this.rowCache.get(r);
      if (!cache || cache.version !== row.version) cache = this.rebuildRow(r, row);
      const parts = cache.parts;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (animating && this.animated.has(r * 16 + p.c)) continue;
        p.group.push(p.m);
      }
    }

    // Animated cells
    for (const [k, a] of this.animated) {
      a.t += dt;
      if (a.t >= a.duration) {
        this.animated.delete(k);
        // draw it statically this frame
      }
      if (a.kind === 'hidden' || a.r < topRow - 1 || a.r > bottomRow + 1) continue;
      const row = grid.rows.get(a.r);
      if (!row) continue;
      if (a.kind === 'wobble' && row.type[a.c] !== B.BOULDER) {
        // blown up or broken while wobbling
        this.animated.delete(k);
        continue;
      }
      this.scratch.length = 0;
      this.describe(a.c, a.r, row.type[a.c], row.variant[a.c], row.hp[a.c], this.scratch, this.animOffsets(a));
      for (const p of this.scratch) p.group.push(p.m);
    }

    // Ghosts of removed blocks shrink and spin away
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.t += dt;
      if (g.t >= g.duration) {
        this.ghosts.splice(i, 1);
        continue;
      }
      const k = g.t / g.duration;
      const anim = { ...NO_ANIM, s: Math.max(0.01, 1 - k * k), dz: k * 0.3, rz: k * 25 };
      this.scratch.length = 0;
      this.describe(g.c, g.r, g.type, g.variant, 1, this.scratch, anim);
      for (const p of this.scratch) p.group.push(p.m);
    }

    for (const g of this.groups.values()) g.end();

    // Forget rows far away from the view
    if (this.rowCache.size > 120) {
      for (const r of this.rowCache.keys()) {
        if (r < topRow - 40 || r > bottomRow + 40) this.rowCache.delete(r);
      }
    }
  }
}
