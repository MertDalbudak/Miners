/*
  Level Generator - fills the grid row by row and guarantees reachable torches.

  Rows go through two phases:
  - raw: random blocks are rolled and monster tunnels carved (tunnels reach up
    to two rows above the row being generated)
  - final: torches are placed, a route from the previous torch is guaranteed,
    and loose boulders without support are turned into stone

  Each phase has its own random stream, so the same seed always produces the
  same mine regardless of how far ahead generation is requested.
*/

import { Rng, hashString } from '../core/rng.js';
import { GameConfig } from '../config.js';
import { B, isPathBlocker } from './blocks.js';
import { CellFlag } from './grid.js';
import { biomeIndexAt } from './biomes.js';

const LOOKAHEAD = 4;
const { COLS, SURFACE_ROWS } = GameConfig;

export function depthOfRow(r) {
  return Math.max(0, r - SURFACE_ROWS + 1);
}

function ramp(value, from, to) {
  if (value <= from) return 0;
  if (value >= to) return 1;
  return (value - from) / (to - from);
}

export class LevelGenerator {
  constructor(grid, seed, options = {}) {
    this.grid = grid;
    this.rawRng = new Rng(seed);
    this.finalRng = new Rng(seed ^ hashString('final'));
    this.oreBoost = options.oreBoost ?? 1;

    this.rawRow = SURFACE_ROWS - 1;
    this.finalRow = SURFACE_ROWS - 1;
    this.torches = [];
    this.nextTorchRow = SURFACE_ROWS + this.finalRng.int(GameConfig.FIRST_TORCH_MIN, GameConfig.FIRST_TORCH_MAX);
    this.anchor = { c: GameConfig.START_COL, r: SURFACE_ROWS - 1 };
    this.lastTunnelRow = -100;
    this.pendingMonsters = [];
  }

  // Make sure every row up to `row` is fully generated
  ensure(row) {
    while (this.rawRow < row + LOOKAHEAD) this.generateRaw(++this.rawRow);
    while (this.finalRow < row) this.finalize(++this.finalRow);
  }

  nextTorchAfter(row) {
    for (const torch of this.torches) {
      if (torch.r > row) return torch;
    }
    return null;
  }

  // ---------------------------------------------------------------- raw phase

  generateRaw(r) {
    const row = this.grid.createRow(r);
    const depth = depthOfRow(r);

    for (let c = 0; c < COLS; c++) {
      const cell = this.rollBlock(depth);
      row.type[c] = cell.type;
      row.hp[c] = cell.hp;
      row.variant[c] = cell.variant;
    }

    if (depth >= GameConfig.MONSTER_MIN_DEPTH) {
      this.maybeTunnel(r, depth);
    }
  }

  rollBlock(depth) {
    const rng = this.rawRng;
    const cell = (type, hp = 1, variant = 0) => ({ type, hp, variant });

    // The first row is always plain dirt for an easy start
    if (depth <= 1) return cell(B.DIRT);

    const biome = biomeIndexAt(depth);
    const boost = this.oreBoost;
    const roll = rng.next() * 1000;
    let t = 0;

    // Rare finds
    if (depth > 30) {
      t += 1.0 * boost * (biome >= 4 ? 3 : 1);
      if (roll < t) return cell(B.GEM, 1, rng.int(0, 4));
    }
    if (depth > 5) {
      t += 2.5;
      if (roll < t) return cell(B.PICKAXE);
    }
    if (depth > 8) {
      t += 2.0;
      if (roll < t) return cell(B.FLARE);
    }
    if (depth > 12) {
      t += 1.5;
      if (roll < t) return cell(B.CHEST);
    }
    if (depth > 25) {
      t += 1.2;
      if (roll < t) return cell(B.SHIELD);
    }

    // Ores get richer with depth
    if (depth >= 60) {
      t += (8 + ramp(depth, 60, 120) * 6) * boost * (biome >= 4 ? 1.5 : 1);
      if (roll < t) return cell(B.DIAMOND);
    }
    if (depth >= 40) {
      t += 40 * ramp(depth, 40, 80) * boost;
      if (roll < t) return cell(B.GOLD);
    }
    if (depth >= 20) {
      t += 50 * ramp(depth, 20, 50) * boost;
      if (roll < t) return cell(B.IRON);
    }
    t += (60 - 20 * ramp(depth, 60, 160)) * boost;
    if (roll < t) return cell(B.COAL);

    // TNT gets more common the deeper you go (gentler in the first meters)
    const tnt = Math.min(80 + depth * 0.5, 220) * (depth < 5 ? 0.5 : 1);
    t += tnt;
    if (roll < t) return cell(B.TNT);

    // Hard and special rock
    if (depth >= 95 && rng.next() * 1000 < 45 * ramp(depth, 95, 130)) {
      return cell(B.MAGMA);
    }
    if (depth >= 70 && rng.next() * 1000 < 30 * ramp(depth, 70, 100)) {
      return cell(B.OBSIDIAN, 3);
    }
    if (depth >= 30 && rng.next() * 1000 < 60 * (0.5 + 0.5 * ramp(depth, 30, 50))) {
      return cell(B.HARDSTONE, 2);
    }
    if (depth >= 15 && rng.next() * 1000 < 28 * ramp(depth, 15, 60) + (biome === 2 ? 14 : 0)) {
      return cell(B.BOULDER);
    }
    if (rng.next() * 1000 < (depth < 40 ? 100 : 40)) {
      return cell(B.STONE);
    }

    return cell(B.DIRT);
  }

  // A small Z-shaped void spanning rows r-2..r. Monsters sleep inside.
  maybeTunnel(r, depth) {
    const rng = this.rawRng;
    if (r - this.lastTunnelRow < GameConfig.TUNNEL_MIN_GAP) return;
    if (!rng.chance(GameConfig.TUNNEL_CHANCE)) return;
    if (r - 2 <= this.finalRow) return;

    const clampCol = (c) => Math.max(0, Math.min(COLS - 1, c));
    const cells = [];
    const push = (c, row) => {
      if (!cells.some(p => p.c === c && p.r === row)) cells.push({ c, r: row });
    };

    let c = rng.int(1, COLS - 2);
    let row = r - 2;
    const dir = rng.chance(0.5) ? 1 : -1;
    push(c, row);
    for (let i = rng.int(1, 2); i > 0; i--) push((c = clampCol(c + dir)), row);
    push(c, ++row);
    const dir2 = rng.chance(0.7) ? dir : -dir;
    for (let i = rng.int(1, 2); i > 0; i--) push((c = clampCol(c + dir2)), row);
    push(c, ++row);
    for (let i = rng.int(0, 1); i > 0; i--) push((c = clampCol(c + dir)), row);

    const carved = [];
    for (const cell of cells) {
      if (this.grid.get(cell.c, cell.r) === B.TNT) continue;
      this.grid.clear(cell.c, cell.r, CellFlag.TUNNEL);
      carved.push(cell);
    }
    if (carved.length === 0) return;
    this.lastTunnelRow = r;

    if (rng.chance(GameConfig.MONSTER_SPAWN_CHANCE)) {
      const spawn = rng.pick(carved);
      const burrower = depth >= GameConfig.BURROWER_MIN_DEPTH && rng.chance(0.35);
      this.pendingMonsters.push({ c: spawn.c, r: spawn.r, kind: burrower ? 'burrower' : 'crawler' });
    }
  }

  // -------------------------------------------------------------- final phase

  finalize(r) {
    if (r === this.nextTorchRow) this.placeTorch(r);
    this.stabilizeBoulders(r);
    this.limitTnt(r);
  }

  placeTorch(r) {
    const rng = this.finalRng;
    const cols = rng.shuffle([...Array(COLS).keys()]);
    const col = cols.find(c => !this.nearTunnel(c, r)) ?? cols[0];

    this.grid.set(col, r, B.TORCH);

    // No TNT or monster lair right next to a torch
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = col + dc;
        const row = r + dr;
        if (!this.grid.inBounds(c) || row < SURFACE_ROWS || (dc === 0 && dr === 0)) continue;
        if (this.grid.get(c, row) === B.TNT) this.grid.set(c, row, B.DIRT);
        if (this.grid.getFlags(c, row) & CellFlag.TUNNEL) {
          this.grid.set(c, row, B.DIRT);
          this.grid.removeFlag(c, row, CellFlag.TUNNEL);
          this.pendingMonsters = this.pendingMonsters.filter(m => m.c !== c || m.r !== row);
        }
      }
    }

    const torch = { c: col, r };
    this.ensurePath(this.anchor, torch);
    this.torches.push(torch);
    this.anchor = torch;

    const depth = depthOfRow(r);
    const [min, max] = depth < 60 ? [7, 9] : depth < 120 ? [8, 10] : [9, 11];
    this.nextTorchRow = r + rng.int(min, max);
  }

  nearTunnel(c, r) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (this.grid.getFlags(c + dc, r + dr) & CellFlag.TUNNEL) return true;
      }
    }
    return false;
  }

  // Breadth-first search moving down/left/right, avoiding TNT and hard rock
  hasPath(from, to) {
    const visited = new Set();
    const queue = [from];
    const key = (c, r) => r * 64 + c;
    visited.add(key(from.c, from.r));

    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur.c === to.c && cur.r === to.r) return true;

      const next = [
        { c: cur.c, r: cur.r + 1 },
        { c: cur.c - 1, r: cur.r },
        { c: cur.c + 1, r: cur.r }
      ];
      for (const n of next) {
        if (!this.grid.inBounds(n.c) || n.r > to.r) continue;
        const k = key(n.c, n.r);
        if (visited.has(k)) continue;
        visited.add(k);
        if (isPathBlocker(this.grid.get(n.c, n.r))) continue;
        queue.push(n);
      }
    }
    return false;
  }

  ensurePath(from, to) {
    if (this.hasPath(from, to)) return;

    // Carve a meandering route: horizontal steps in a row, then one step down
    const rng = this.finalRng;
    let c = from.c;
    let r = from.r;
    while (r < to.r) {
      const dx = to.c - c;
      const rowsLeft = to.r - r;
      let steps = 0;
      if (dx !== 0) {
        steps = rowsLeft <= 1 ? Math.abs(dx) : rng.int(0, Math.min(Math.abs(dx), 2));
      }
      for (let i = 0; i < steps; i++) {
        c += Math.sign(dx);
        this.makePassable(c, r);
      }
      r++;
      this.makePassable(c, r);
    }
    while (c !== to.c) {
      c += Math.sign(to.c - c);
      this.makePassable(c, r);
    }
  }

  makePassable(c, r) {
    if (r < SURFACE_ROWS) return;
    const type = this.grid.get(c, r);
    if (isPathBlocker(type)) {
      this.grid.set(c, r, B.DIRT);
      this.grid.addFlag(c, r, CellFlag.PATH);
    }
  }

  // Boulders above empty space at generation time would fall immediately
  stabilizeBoulders(r) {
    for (let c = 0; c < COLS; c++) {
      if (this.grid.get(c, r) === B.BOULDER && this.grid.get(c, r + 1) === B.EMPTY) {
        this.grid.set(c, r, B.STONE);
      }
    }
  }

  // Never allow a (nearly) full row of TNT
  limitTnt(r) {
    const tnt = [];
    for (let c = 0; c < COLS; c++) {
      if (this.grid.get(c, r) === B.TNT) tnt.push(c);
    }
    const maxTnt = COLS - 3;
    if (tnt.length <= maxTnt) return;
    this.finalRng.shuffle(tnt);
    for (let i = 0; i < tnt.length - maxTnt; i++) this.grid.set(tnt[i], r, B.DIRT);
  }
}
