/*
  Miners - game rules

  Pure logic: no rendering, no DOM. Everything that happens is announced via
  events so the 3D view, audio and UI can react.

  Core rules (kept from the original):
  - The miner digs left, right or down - never up.
  - Digging dirt costs energy, ores give energy back.
  - Underground only the cells near the miner's lamp are visible. Grabbing the
    torch at the bottom of a section reveals the next section for a moment.
  - TNT explodes, stone needs a pickaxe, monsters hunt through open tunnels.
*/

import { Emitter } from '../core/emitter.js';
import { Rng, hashString } from '../core/rng.js';
import { GameConfig as C, MILESTONES } from '../config.js';
import { B, Dig, blockInfo, blockPoints, GEM_VARIANTS } from './blocks.js';
import { Grid, CellFlag } from './grid.js';
import { LevelGenerator, depthOfRow } from './levelgen.js';
import { BIOMES, biomeIndexAt } from './biomes.js';
import { Monster, updateMonsters } from './monsters.js';

export const Action = Object.freeze({
  LEFT: 'left',
  RIGHT: 'right',
  DOWN: 'down',
  FLARE: 'flare'
});

const DIRS = {
  left: [-1, 0],
  right: [1, 0],
  down: [0, 1]
};

const REVEAL_MIN_VIEW = 0.5; // seconds a torch reveal is shown before input can skip it

function milestoneAfter(index) {
  if (index < MILESTONES.length) return MILESTONES[index];
  return MILESTONES[MILESTONES.length - 1] + (index - MILESTONES.length + 1) * 100;
}

export class Game extends Emitter {
  constructor(options = {}) {
    super();
    this.mode = options.mode || 'normal';
    this.seed = (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
    this.upgrades = { ...(options.upgrades || {}) };
    this.rng = new Rng(this.seed ^ hashString('runtime'));

    const up = this.upgrades;
    this.grid = new Grid(C.COLS);
    this.gen = new LevelGenerator(this.grid, this.seed, {
      oreBoost: this.mode === 'daily' ? 1 : 1 + 0.1 * (up.prospector || 0)
    });

    this.revealTime = C.REVEAL_TIME + 0.75 * (up.torch || 0);
    this.state = 'ready';
    this.time = 0;

    this.player = {
      c: C.START_COL,
      r: C.SURFACE_ROWS - 1,
      facing: 1,
      energy: C.START_ENERGY + 2 * (up.stamina || 0),
      pickaxes: up.toolbelt || 0,
      shield: (up.hardhat || 0) > 0,
      flares: up.flares || 0,
      alive: true,
      invulnerable: 0
    };

    this.monsters = [];
    this.nextMonsterId = 1;
    this.fallingBoulders = [];
    this.nextBoulderId = 1;
    this.wobbling = new Map();
    this.pendingExplosions = [];
    this.primed = new Set();

    this.score = 0;
    this.maxDepth = 0;
    this.moves = 0;
    this.combo = 0;
    this.lastOreMove = -100;
    this.milestoneIndex = 0;
    this.biomeIndex = 0;

    this.pageTop = 0;
    this.targetTorch = null;
    this.torchCollected = false;
    this.pagePending = false;

    this.cooldown = 0;
    this.queued = null;
    this.queuedAge = 0;
    this.falling = false;
    this.fallTimer = 0;
    this.fallSteps = 0;
    this.scrollTimer = 0;

    this.reveal = { kind: null, delay: 0, timer: 0, duration: 0 };
    this.surfaceLight = 1;
    this.revealLevel = 1;

    this.deathCause = null;
    this.stats = {
      ores: { coal: 0, iron: 0, gold: 0, diamond: 0 },
      gems: [0, 0, 0, 0, 0],
      oreCoins: 0,
      bonusCoins: 0,
      blocksDug: 0,
      hardBroken: 0,
      torches: 0,
      chests: 0,
      flaresUsed: 0,
      shieldsUsed: 0,
      monstersKilled: 0,
      boulderKills: 0,
      explosions: 0,
      chainReactions: 0,
      survivedTnt: 0,
      maxCombo: 0,
      time: 0
    };

    this.gen.ensure(this.pageTop + 45);
    this.targetTorch = this.gen.nextTorchAfter(this.player.r);
  }

  // ------------------------------------------------------------------ queries

  get depth() {
    return depthOfRow(this.player.r);
  }

  get comboMultiplier() {
    if (this.combo < 2) return 1;
    return Math.min(1 + (this.combo - 1) * C.COMBO_STEP, C.COMBO_MAX);
  }

  isBusy() {
    return this.cooldown > 0 || this.falling || this.scrollTimer > 0;
  }

  isFrozen() {
    if (this.scrollTimer > 0) return true;
    const rv = this.reveal;
    return rv.kind === 'page' && (rv.delay > 0 || rv.timer > C.REVEAL_FADE);
  }

  isUnderground() {
    return this.player.r >= C.SURFACE_ROWS;
  }

  monsterAt(c, r) {
    return this.monsters.find(m => m.alive && m.c === c && m.r === r) || null;
  }

  // A boulder that is currently falling is not in the grid but still solid
  boulderAt(c, r) {
    return this.fallingBoulders.find(b => b.active && b.c === c && b.r === r) || null;
  }

  itemState() {
    const p = this.player;
    return { pickaxes: p.pickaxes, shield: p.shield, flares: p.flares };
  }

  // ------------------------------------------------------------------ control

  start() {
    if (this.state !== 'ready') return;
    this.state = 'playing';
    this.emit('start', { mode: this.mode, seed: this.seed });
    this.emit('energy', { value: this.player.energy, delta: 0 });
    this.emit('items', this.itemState());
  }

  // Give the player a moment to look at a torch reveal before input can skip it
  revealBlocksInput() {
    const rv = this.reveal;
    return rv.kind === 'page' && (rv.delay > 0 || rv.duration - rv.timer < REVEAL_MIN_VIEW);
  }

  act(action) {
    if (this.state !== 'playing') return false;
    if (this.revealBlocksInput()) return false;

    if (action === Action.FLARE) return this.useFlare();
    if (!DIRS[action]) return false;

    if (this.isBusy()) {
      this.queued = action;
      this.queuedAge = 0;
      return false;
    }
    return this.tryMove(action);
  }

  skipReveal() {
    const rv = this.reveal;
    if (rv.kind === 'page' && rv.delay <= 0 && rv.timer > C.REVEAL_FADE) {
      rv.timer = C.REVEAL_FADE;
    }
  }

  tryMove(dir) {
    const p = this.player;
    const [dc, dr] = DIRS[dir];
    if (dc !== 0) p.facing = dc;
    this.skipReveal();

    const nc = p.c + dc;
    const nr = p.r + dr;
    if (this.boulderAt(nc, nr)) {
      this.emit('bump', { c: nc, r: nr, type: B.BOULDER, reason: 'wall', dir });
      this.cooldown = 0.08;
      return false;
    }
    const type = this.grid.get(nc, nr);
    const info = blockInfo(type);
    const variant = this.grid.getVariant(nc, nr);

    switch (info.dig) {
      case Dig.WALL:
        this.emit('bump', { c: nc, r: nr, type, reason: 'wall', dir });
        this.cooldown = 0.08;
        return false;

      case Dig.NONE:
        break;

      case Dig.SOFT:
        if (p.energy < info.cost) {
          this.emit('bump', { c: nc, r: nr, type, reason: 'energy', dir });
          this.cooldown = 0.15;
          this.checkStuck();
          return false;
        }
        this.changeEnergy(-info.cost);
        this.removeBlock(nc, nr, 'dig');
        this.addScore(info.points);
        this.stats.blocksDug++;
        break;

      case Dig.FREE:
        this.removeBlock(nc, nr, 'collect');
        this.collect(type, variant, nc, nr);
        break;

      case Dig.HARD: {
        if (p.pickaxes <= 0) {
          this.emit('bump', { c: nc, r: nr, type, reason: 'pickaxe', dir });
          this.cooldown = 0.15;
          this.checkStuck();
          return false;
        }
        p.pickaxes--;
        this.emit('items', this.itemState());
        const hp = this.grid.getHp(nc, nr) - 1;
        if (hp > 0) {
          this.grid.setHp(nc, nr, hp);
          this.emit('hit', { c: nc, r: nr, type, hp, maxHp: info.hp, dir });
          this.cooldown = C.MOVE_TIME;
          this.checkStuck();
          return true;
        }
        this.removeBlock(nc, nr, 'break');
        this.addScore(info.points);
        this.stats.hardBroken++;
        break;
      }

      case Dig.DEADLY:
        this.cooldown = C.MOVE_TIME;
        this.emit('ignite', { c: nc, r: nr, dir });
        this.explode(nc, nr, 'player');
        if (p.alive) this.afterAction();
        return true;
    }

    this.movePlayerTo(nc, nr, dir);
    return true;
  }

  movePlayerTo(c, r, dir) {
    const p = this.player;
    const from = { c: p.c, r: p.r };
    p.c = c;
    p.r = r;
    this.moves++;
    this.cooldown = C.MOVE_TIME;

    if (this.combo > 0 && this.moves - this.lastOreMove > C.COMBO_WINDOW_MOVES) {
      this.combo = 0;
      this.emit('combo', { value: 0, multiplier: 1 });
    }

    this.emit('move', { from, to: { c, r }, dir, duration: C.MOVE_TIME });
    this.updateDepth();
    if (this.checkMonsterContact()) return;
    this.checkPage();
    this.afterAction();
  }

  afterAction() {
    if (!this.player.alive) return;
    if (this.shouldFall()) {
      this.startFall();
    } else {
      this.checkStuck();
    }
  }

  useFlare() {
    const p = this.player;
    if (this.reveal.kind === 'page') return false;
    if (p.flares <= 0) {
      this.emit('bump', { c: p.c, r: p.r, type: B.EMPTY, reason: 'flare' });
      return false;
    }
    p.flares--;
    this.stats.flaresUsed++;
    this.reveal = { kind: 'flare', delay: 0, timer: C.FLARE_TIME, duration: C.FLARE_TIME, started: false };
    this.emit('flare', { c: p.c, r: p.r });
    this.emit('items', this.itemState());
    return true;
  }

  // ------------------------------------------------------------- block logic

  removeBlock(c, r, reason) {
    const type = this.grid.get(c, r);
    const variant = this.grid.getVariant(c, r);
    this.grid.clear(c, r, CellFlag.DUG);
    this.emit('blockRemoved', { c, r, type, variant, reason });
  }

  collect(type, variant, c, r) {
    const p = this.player;
    const info = blockInfo(type);

    if (info.ore) {
      if (this.combo > 0 && this.moves - this.lastOreMove <= C.COMBO_WINDOW_MOVES) {
        this.combo++;
      } else {
        this.combo = 1;
      }
      this.lastOreMove = this.moves;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);

      const multiplier = this.comboMultiplier;
      const points = Math.round(blockPoints(type, variant) * multiplier);
      this.changeEnergy(info.energy);
      this.addScore(points);
      this.stats.oreCoins += info.coins;
      if (type === B.GEM) this.stats.gems[variant]++;
      else this.stats.ores[info.key]++;

      this.emit('collect', { c, r, type, variant, energy: info.energy, points, combo: this.combo, multiplier });
      if (this.combo >= 2) this.emit('combo', { value: this.combo, multiplier });
      return;
    }

    if (type === B.TORCH) {
      this.changeEnergy(info.energy);
      this.addScore(info.points);
      this.stats.torches++;
      if (this.targetTorch && r < this.targetTorch.r) {
        // reached from the side after the camera already moved on: light up now
        this.startReveal(0);
      } else {
        this.torchCollected = true;
      }
      this.emit('collect', { c, r, type, variant, energy: info.energy, points: info.points });
      return;
    }

    switch (info.item) {
      case 'pickaxe':
        p.pickaxes++;
        break;
      case 'flare':
        p.flares++;
        break;
      case 'shield':
        if (p.shield) this.addScore(150);
        p.shield = true;
        break;
      case 'chest':
        this.openChest(c, r);
        break;
    }
    this.addScore(info.points);
    this.emit('collect', { c, r, type, variant, points: info.points, item: info.item });
    this.emit('items', this.itemState());
  }

  openChest(c, r) {
    const p = this.player;
    const roll = this.rng.next();
    let reward;
    if (roll < 0.3) {
      reward = { kind: 'energy', amount: 8 };
      this.changeEnergy(8);
    } else if (roll < 0.55) {
      reward = { kind: 'pickaxe', amount: 1 };
      p.pickaxes++;
    } else if (roll < 0.75) {
      reward = { kind: 'flare', amount: 1 };
      p.flares++;
    } else if (roll < 0.85 && !p.shield) {
      reward = { kind: 'shield', amount: 1 };
      p.shield = true;
    } else {
      reward = { kind: 'coins', amount: 20 };
      this.stats.bonusCoins += 20;
    }
    this.stats.chests++;
    this.emit('chest', { c, r, reward });
  }

  changeEnergy(delta) {
    this.player.energy = Math.max(0, this.player.energy + delta);
    this.emit('energy', { value: this.player.energy, delta });
  }

  addScore(points) {
    if (points <= 0) return;
    this.score += points;
    this.emit('score', { value: this.score, delta: points });
  }

  updateDepth() {
    const depth = this.depth;
    if (depth <= this.maxDepth) return;

    const gained = depth - this.maxDepth;
    this.maxDepth = depth;
    this.addScore(gained * C.DEPTH_POINTS);
    this.emit('depth', { depth });

    const biome = biomeIndexAt(depth);
    if (biome > this.biomeIndex) {
      this.biomeIndex = biome;
      this.emit('biome', { index: biome, biome: BIOMES[biome] });
    }

    while (depth >= milestoneAfter(this.milestoneIndex)) {
      const milestone = milestoneAfter(this.milestoneIndex++);
      const points = milestone * 10;
      this.changeEnergy(C.MILESTONE_ENERGY);
      this.addScore(points);
      this.emit('milestone', { depth: milestone, energy: C.MILESTONE_ENERGY, points });
    }
  }

  // ---------------------------------------------------------- paging / reveal

  checkPage() {
    if (!this.targetTorch || this.player.r < this.targetTorch.r) return;
    if (this.falling) {
      this.pagePending = true;
      return;
    }
    this.advancePage(this.torchCollected);
  }

  advancePage(withReveal) {
    const p = this.player;
    this.pagePending = false;
    this.torchCollected = false;
    this.pageTop = p.r - C.ROWS_ABOVE_PLAYER;
    this.gen.ensure(this.pageTop + 45);
    this.targetTorch = this.gen.nextTorchAfter(p.r);
    this.scrollTimer = C.SCROLL_TIME;
    this.queued = null;

    if (withReveal) this.startReveal(C.SCROLL_TIME);

    for (const m of this.monsters) {
      if (m.alive && m.r < this.pageTop - 6) {
        m.alive = false;
        this.emit('monsterDespawn', { monster: m });
      }
    }
    this.monsters = this.monsters.filter(m => m.alive);

    this.emit('page', { top: this.pageTop, reveal: withReveal, duration: C.SCROLL_TIME });
  }

  startReveal(delay) {
    this.reveal = { kind: 'page', delay, timer: this.revealTime, duration: this.revealTime, started: false };
    this.queued = null;
  }

  updateReveal(dt) {
    const p = this.player;
    if (this.state === 'ready' || p.r < C.SURFACE_ROWS) {
      this.surfaceLight = 1;
    } else {
      this.surfaceLight = Math.max(0, this.surfaceLight - dt / C.SURFACE_FADE);
    }

    let level = this.surfaceLight;
    const rv = this.reveal;
    if (rv.kind) {
      if (rv.delay > 0) {
        rv.delay -= dt;
      } else {
        if (!rv.started) {
          rv.started = true;
          this.emit('revealStart', { kind: rv.kind, duration: rv.duration });
        }
        rv.timer -= dt;
        if (rv.timer <= 0) {
          const kind = rv.kind;
          this.reveal = { kind: null, delay: 0, timer: 0, duration: 0 };
          this.emit('revealEnd', { kind });
        } else {
          const elapsed = rv.duration - rv.timer;
          const fadeIn = Math.min(1, elapsed / 0.15);
          const fadeOut = Math.min(1, rv.timer / C.REVEAL_FADE);
          level = Math.max(level, Math.min(fadeIn, fadeOut));
        }
      }
    }
    this.revealLevel = level;
  }

  // ------------------------------------------------------------------ gravity

  shouldFall() {
    const p = this.player;
    return p.r >= C.SURFACE_ROWS - 1 && this.grid.get(p.c, p.r + 1) === B.EMPTY &&
      !this.monsterAt(p.c, p.r + 1) && !this.boulderAt(p.c, p.r + 1);
  }

  startFall() {
    this.falling = true;
    this.fallSteps = 0;
    this.fallTimer = this.cooldown > 0 ? this.cooldown : 0.05;
    this.emit('fallStart', { c: this.player.c, r: this.player.r });
  }

  updateFall(dt) {
    const p = this.player;
    this.fallTimer -= dt;
    while (this.falling && this.fallTimer <= 0) {
      if (this.grid.get(p.c, p.r + 1) === B.EMPTY && !this.boulderAt(p.c, p.r + 1)) {
        const from = { c: p.c, r: p.r };
        p.r++;
        this.fallSteps++;
        const step = Math.max(C.FALL_STEP_MIN, C.FALL_STEP_START - this.fallSteps * C.FALL_ACCEL);
        this.fallTimer += step;
        this.emit('fall', { from, to: { c: p.c, r: p.r }, duration: step });
        this.updateDepth();
        if (this.targetTorch && p.r >= this.targetTorch.r) this.pagePending = true;
        if (this.checkMonsterContact()) return;
      } else {
        this.falling = false;
        this.emit('land', { c: p.c, r: p.r, steps: this.fallSteps });
        if (this.pagePending || (this.targetTorch && p.r >= this.targetTorch.r)) {
          this.advancePage(this.torchCollected);
        }
        this.checkStuck();
      }
    }
  }

  // ------------------------------------------------------------------- danger

  // Is there anything useful left to do? Walks every cell the miner can reach
  // through open space (sideways, down, falling), not just the neighbours, so
  // pacing inside an empty pocket doesn't count as being able to move.
  hasMove() {
    const p = this.player;
    const key = (c, r) => r * 16 + c;
    const seen = new Set([key(p.c, p.r)]);
    const queue = [{ c: p.c, r: p.r }];
    const maxRow = p.r + 40;
    let needEnergy = false;
    while (queue.length > 0) {
      const cur = queue.shift();
      const below = this.grid.get(cur.c, cur.r + 1);
      const standing = (cur.c === p.c && cur.r === p.r) || below !== B.EMPTY || this.boulderAt(cur.c, cur.r + 1);
      // in mid-air the miner can only keep falling
      const dirs = standing ? Object.values(DIRS) : [[0, 1]];
      for (const [dc, dr] of dirs) {
        const c = cur.c + dc;
        const r = cur.r + dr;
        if (!this.grid.inBounds(c) || r > maxRow || this.boulderAt(c, r)) continue;
        const type = this.grid.get(c, r);
        const info = blockInfo(type);
        switch (info.dig) {
          case Dig.NONE: {
            const k = key(c, r);
            if (!seen.has(k)) {
              seen.add(k);
              queue.push({ c, r });
            }
            break;
          }
          case Dig.FREE:
            return { ok: true };
          case Dig.SOFT:
            if (p.energy >= info.cost) return { ok: true };
            needEnergy = true;
            break;
          case Dig.HARD:
            if (p.pickaxes >= this.grid.getHp(c, r)) return { ok: true };
            break;
          case Dig.DEADLY:
            if (p.shield) return { ok: true };
            break;
        }
      }
    }
    return { ok: false, needEnergy };
  }

  checkStuck() {
    if (!this.player.alive || this.falling || this.state !== 'playing') return;
    const result = this.hasMove();
    if (!result.ok) this.die(result.needEnergy ? 'exhausted' : 'trapped');
  }

  // Shield (hard hat) absorbs one fatal hit. Returns true if the miner survives.
  absorbHit(cause) {
    const p = this.player;
    if (p.invulnerable > 0) return true;
    if (!p.shield) return false;
    p.shield = false;
    p.invulnerable = C.INVULNERABLE_TIME;
    this.stats.shieldsUsed++;
    if (cause === 'tnt') this.stats.survivedTnt++;
    this.emit('shieldBreak', { cause, c: p.c, r: p.r });
    this.emit('items', this.itemState());
    return true;
  }

  checkMonsterContact() {
    const p = this.player;
    if (!p.alive) return true;
    for (const m of [...this.monsters]) {
      if (!m.alive || !m.awake) continue;
      if (Math.abs(m.c - p.c) + Math.abs(m.r - p.r) > 1) continue;
      if (p.invulnerable > 0) continue;
      this.emit('monsterAttack', { monster: m });
      if (this.absorbHit('monster')) {
        this.killMonster(m, 'bonk');
        continue;
      }
      this.die('monster', { monster: m });
      return true;
    }
    return false;
  }

  killMonster(m, cause) {
    if (!m.alive) return;
    m.alive = false;
    this.monsters = this.monsters.filter(x => x !== m);
    this.stats.monstersKilled++;
    if (cause === 'boulder') this.stats.boulderKills++;
    this.addScore(C.MONSTER_POINTS);
    this.emit('monsterDie', { monster: m, cause });
  }

  activateMonsters() {
    const pending = this.gen.pendingMonsters;
    if (pending.length === 0) return;
    const limitRow = this.pageTop + C.PAGE_ROWS + 6;
    const max = Math.min(2 + Math.floor(Math.max(0, this.maxDepth - C.MONSTER_MIN_DEPTH) / 15), C.MONSTER_MAX);

    while (pending.length > 0 && pending[0].r <= limitRow) {
      const spawn = pending.shift();
      if (spawn.r < this.pageTop - 2) continue;
      if (this.monsters.length >= max) continue;
      if (this.grid.get(spawn.c, spawn.r) !== B.EMPTY) continue;
      if (this.monsterAt(spawn.c, spawn.r)) continue;
      const m = new Monster(this.nextMonsterId++, spawn.c, spawn.r, spawn.kind);
      this.monsters.push(m);
      this.emit('monsterSpawn', { monster: m });
    }
  }

  // ------------------------------------------------------------------ boulders

  boulderSupported(c, rBelow) {
    if (this.grid.get(c, rBelow) !== B.EMPTY) return true;
    const p = this.player;
    return p.alive && p.c === c && p.r === rBelow;
  }

  updateBoulders(dt) {
    const r0 = Math.max(C.SURFACE_ROWS, this.pageTop - 2);
    const r1 = this.pageTop + C.PAGE_ROWS + 8;

    for (let r = r0; r <= r1; r++) {
      const row = this.grid.rows.get(r);
      if (!row) continue;
      for (let c = 0; c < C.COLS; c++) {
        if (row.type[c] !== B.BOULDER) continue;
        const key = r * 16 + c;
        if (!this.boulderSupported(c, r + 1)) {
          if (!this.wobbling.has(key)) {
            this.wobbling.set(key, C.BOULDER_WOBBLE);
            this.emit('boulderWobble', { c, r, duration: C.BOULDER_WOBBLE });
          }
        } else if (this.wobbling.has(key)) {
          this.wobbling.delete(key);
          this.emit('boulderSettle', { c, r });
        }
      }
    }

    for (const [key, t] of [...this.wobbling]) {
      const left = t - dt;
      if (left > 0) {
        this.wobbling.set(key, left);
        continue;
      }
      this.wobbling.delete(key);
      const c = key % 16;
      const r = Math.floor(key / 16);
      if (this.grid.get(c, r) !== B.BOULDER) continue;
      this.grid.clear(c, r, 0);
      const boulder = { id: this.nextBoulderId++, c, r, timer: 0, active: true };
      this.fallingBoulders.push(boulder);
      this.emit('boulderDetach', { id: boulder.id, c, r });
    }

    for (const b of [...this.fallingBoulders]) {
      b.timer -= dt;
      while (b.active && b.timer <= 0) {
        this.stepBoulder(b);
        b.timer += C.BOULDER_STEP;
      }
    }
    this.fallingBoulders = this.fallingBoulders.filter(b => b.active);
  }

  stepBoulder(b) {
    const p = this.player;
    const nr = b.r + 1;

    if (p.alive && p.c === b.c && p.r === nr) {
      if (this.absorbHit('boulder')) {
        b.active = false;
        this.emit('boulderShatter', { id: b.id, c: b.c, r: b.r });
        return;
      }
      b.r = nr;
      b.active = false;
      this.emit('boulderFall', { id: b.id, c: b.c, r: nr, duration: C.BOULDER_STEP });
      this.die('crushed', { boulder: b.id });
      return;
    }

    const monster = this.monsterAt(b.c, nr);
    if (monster) this.killMonster(monster, 'boulder');

    const below = this.grid.get(b.c, nr);
    if (below === B.EMPTY) {
      b.r = nr;
      this.emit('boulderFall', { id: b.id, c: b.c, r: nr, duration: C.BOULDER_STEP });
      return;
    }

    b.active = false;
    if (below === B.TNT) {
      this.emit('boulderShatter', { id: b.id, c: b.c, r: b.r });
      this.explode(b.c, nr, 'boulder');
      return;
    }
    // nothing may end up inside the boulder's resting cell
    const squashed = this.monsterAt(b.c, b.r);
    if (squashed) this.killMonster(squashed, 'boulder');
    if (p.alive && p.c === b.c && p.r === b.r) {
      if (this.absorbHit('boulder')) {
        this.emit('boulderShatter', { id: b.id, c: b.c, r: b.r });
        return;
      }
      this.die('crushed', { boulder: b.id });
      return;
    }
    this.grid.set(b.c, b.r, B.BOULDER, 1);
    this.emit('boulderLand', { id: b.id, c: b.c, r: b.r });
  }

  // ---------------------------------------------------------------- explosions

  explode(c, r, cause) {
    const p = this.player;
    this.stats.explosions++;
    this.primed.delete(r * 16 + c);
    if (cause === 'chain') this.stats.chainReactions++;

    const destroyed = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const x = c + dc;
        const y = r + dr;
        if (!this.grid.inBounds(x) || y < C.SURFACE_ROWS || !this.grid.hasRow(y)) continue;
        const type = this.grid.get(x, y);
        if (dc === 0 && dr === 0) {
          this.grid.clear(x, y, CellFlag.DUG);
          continue;
        }
        if (type === B.TNT) {
          const key = y * 16 + x;
          if (!this.primed.has(key)) {
            this.primed.add(key);
            this.pendingExplosions.push({ c: x, r: y, timer: C.CHAIN_DELAY });
            this.emit('tntPrimed', { c: x, r: y });
          }
          continue;
        }
        if (type === B.EMPTY || type === B.OBSIDIAN || type === B.TORCH) continue;
        destroyed.push({ c: x, r: y, type, variant: this.grid.getVariant(x, y) });
        this.grid.clear(x, y, CellFlag.DUG);
        this.wobbling.delete(y * 16 + x);
      }
    }

    this.emit('explosion', { c, r, cause, destroyed });

    for (const m of [...this.monsters]) {
      if (Math.abs(m.c - c) <= 1 && Math.abs(m.r - r) <= 1) this.killMonster(m, 'explosion');
    }
    for (const b of this.fallingBoulders) {
      if (b.active && Math.abs(b.c - c) <= 1 && Math.abs(b.r - r) <= 1) {
        b.active = false;
        this.emit('boulderShatter', { id: b.id, c: b.c, r: b.r });
      }
    }

    if (p.alive && Math.abs(p.c - c) <= 1 && Math.abs(p.r - r) <= 1) {
      if (!this.absorbHit('tnt')) {
        this.die('tnt', { c, r });
        return;
      }
    }

    if (p.alive && !this.falling && cause !== 'player' && this.shouldFall()) {
      this.startFall();
    }
  }

  updateExplosions(dt) {
    if (this.pendingExplosions.length === 0) return;
    const ready = [];
    for (const e of this.pendingExplosions) {
      e.timer -= dt;
      if (e.timer <= 0) ready.push(e);
    }
    if (ready.length === 0) return;
    this.pendingExplosions = this.pendingExplosions.filter(e => e.timer > 0);
    for (const e of ready) {
      if (this.grid.get(e.c, e.r) === B.TNT) this.explode(e.c, e.r, 'chain');
      else this.primed.delete(e.r * 16 + e.c);
      if (!this.player.alive) return;
    }
    if (!this.falling && this.cooldown <= 0) this.afterAction();
  }

  // --------------------------------------------------------------------- death

  die(cause, extra = {}) {
    const p = this.player;
    if (!p.alive) return;
    p.alive = false;
    this.state = 'dead';
    this.deathCause = cause;
    this.falling = false;
    this.queued = null;
    this.emit('death', { cause, c: p.c, r: p.r, ...extra });
  }

  getResults() {
    const depthCoins = Math.floor(this.maxDepth / 5);
    return {
      mode: this.mode,
      seed: this.seed,
      score: this.score,
      depth: this.maxDepth,
      cause: this.deathCause,
      stats: { ...this.stats, ores: { ...this.stats.ores }, gems: [...this.stats.gems] },
      coins: {
        ores: this.stats.oreCoins,
        bonus: this.stats.bonusCoins,
        depth: depthCoins,
        total: this.stats.oreCoins + this.stats.bonusCoins + depthCoins
      }
    };
  }

  // -------------------------------------------------------------------- update

  update(dt) {
    if (this.state === 'ready') {
      this.updateReveal(dt);
      return;
    }
    dt = Math.min(dt, 0.05);
    this.time += dt;

    if (this.state === 'dead') {
      this.updateReveal(dt);
      return;
    }

    const p = this.player;
    this.stats.time += dt;
    if (p.invulnerable > 0) p.invulnerable -= dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.scrollTimer > 0) this.scrollTimer -= dt;

    this.gen.ensure(Math.max(this.pageTop, p.r) + 45);

    if (this.falling) this.updateFall(dt);
    if (!p.alive) return;

    if (!this.isFrozen()) {
      this.activateMonsters();
      updateMonsters(this, dt);
      if (!p.alive) return;
      this.updateBoulders(dt);
      if (!p.alive) return;
    }
    this.updateExplosions(dt);
    if (!p.alive) return;

    // Safety net: something (a burrower, a blast) may have removed the floor
    if (!this.falling && this.shouldFall()) this.startFall();

    if (this.queued) {
      this.queuedAge += dt;
      if (this.queuedAge > C.QUEUE_EXPIRE || this.revealBlocksInput()) {
        this.queued = null;
      } else if (!this.isBusy()) {
        const action = this.queued;
        this.queued = null;
        this.tryMove(action);
      }
    }

    this.updateReveal(dt);
  }
}

export { GEM_VARIANTS };
