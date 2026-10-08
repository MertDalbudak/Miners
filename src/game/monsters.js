/*
  Cave monsters
  - Crawlers sleep in sealed tunnels, wake up when the miner comes close and
    hunt through open space (tunnels and everything the miner dug).
  - Burrowers (deep layers only) are slower but can chew through soft blocks.
  Touching a monster (same cell or directly next to it) is fatal unless the
  miner wears a hard hat.
*/

import { GameConfig } from '../config.js';
import { B, blockInfo, Dig } from './blocks.js';

const DIRS = [
  { dc: 0, dr: 1 },
  { dc: 0, dr: -1 },
  { dc: 1, dr: 0 },
  { dc: -1, dr: 0 }
];

export class Monster {
  constructor(id, c, r, kind = 'crawler') {
    this.id = id;
    this.c = c;
    this.r = r;
    this.kind = kind;
    this.state = 'sleep';
    this.timer = 0;
    this.alive = true;
  }

  get awake() {
    return this.state === 'hunt';
  }
}

export function monsterInterval(depth) {
  const t = GameConfig.MONSTER_INTERVAL_START - depth * GameConfig.MONSTER_SPEEDUP_PER_M;
  return Math.max(GameConfig.MONSTER_INTERVAL_MIN, Math.min(GameConfig.MONSTER_INTERVAL_START, t));
}

function canBurrow(type) {
  const info = blockInfo(type);
  return type === B.DIRT || info.ore === true;
}

function isOpenFor(game, monster, c, r) {
  if (game.boulderAt(c, r)) return false;
  const type = game.grid.get(c, r);
  if (type === B.EMPTY) return true;
  return monster.kind === 'burrower' && canBurrow(type);
}

function occupied(game, monster, c, r) {
  return game.monsters.some(m => m !== monster && m.alive && m.c === c && m.r === r);
}

// First step of the shortest path towards a cell touching the miner
function findStep(game, monster, maxDist) {
  const p = game.player;
  const key = (c, r) => r * 64 + c;
  const start = { c: monster.c, r: monster.r, first: null };
  const visited = new Set([key(start.c, start.r)]);
  const queue = [start];
  const minRow = p.r - 14;
  const maxRow = p.r + 14;

  while (queue.length > 0) {
    const cur = queue.shift();
    const dist = Math.abs(cur.c - p.c) + Math.abs(cur.r - p.r);
    if (dist <= 1 && cur.first) return cur.first;
    if (dist <= 1) return null; // already touching
    if (Math.abs(cur.c - monster.c) + Math.abs(cur.r - monster.r) > maxDist) continue;

    for (const d of DIRS) {
      const c = cur.c + d.dc;
      const r = cur.r + d.dr;
      if (!game.grid.inBounds(c) || r < GameConfig.SURFACE_ROWS - 1 || r < minRow || r > maxRow) continue;
      const k = key(c, r);
      if (visited.has(k)) continue;
      visited.add(k);
      const isPlayerCell = c === p.c && r === p.r;
      if (!isPlayerCell && !isOpenFor(game, monster, c, r)) continue;
      if (occupied(game, monster, c, r)) continue;
      const first = cur.first || { c, r };
      queue.push({ c, r, first });
    }
  }
  return null;
}

function wanderStep(game, monster) {
  if (game.rng.next() < 0.45) return null;
  const options = [];
  for (const d of DIRS) {
    const c = monster.c + d.dc;
    const r = monster.r + d.dr;
    if (!game.grid.inBounds(c)) continue;
    if (game.grid.get(c, r) !== B.EMPTY || game.boulderAt(c, r)) continue;
    if (occupied(game, monster, c, r)) continue;
    options.push({ c, r });
  }
  return options.length ? options[Math.floor(game.rng.next() * options.length)] : null;
}

export function updateMonsters(game, dt) {
  const p = game.player;
  const interval = monsterInterval(game.maxDepth);

  for (const m of game.monsters) {
    if (!m.alive) continue;
    const dist = Math.abs(m.c - p.c) + Math.abs(m.r - p.r);

    if (m.state === 'sleep') {
      if (dist <= GameConfig.MONSTER_WAKE_DIST && p.r >= GameConfig.SURFACE_ROWS) {
        m.state = 'waking';
        m.timer = GameConfig.MONSTER_WAKE_TIME;
        game.emit('monsterWake', { monster: m });
      }
      continue;
    }

    if (m.state === 'waking') {
      m.timer -= dt;
      if (m.timer > 0) continue;
      m.state = 'hunt';
      m.timer = interval * 0.4;
      continue;
    }

    m.timer -= dt;
    if (m.timer > 0) continue;

    const burrower = m.kind === 'burrower';
    m.timer = burrower ? interval * 1.6 : interval;

    let step = null;
    if (!burrower || dist <= 8) step = findStep(game, m, 18);
    if (!step) step = wanderStep(game, m);
    if (!step) continue;

    const from = { c: m.c, r: m.r };
    const type = game.grid.get(step.c, step.r);
    if (type !== B.EMPTY) {
      if (blockInfo(type).dig === Dig.WALL) continue;
      game.grid.clear(step.c, step.r);
      game.emit('monsterDig', { monster: m, c: step.c, r: step.r, type });
    }
    m.c = step.c;
    m.r = step.r;
    game.emit('monsterMove', { monster: m, from, to: { c: m.c, r: m.r }, duration: Math.min(0.32, m.timer * 0.8) });
  }

  game.checkMonsterContact();
}
