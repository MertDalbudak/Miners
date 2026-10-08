import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/game.js';
import { Monster } from '../src/game/monsters.js';
import { B, blockInfo, Dig } from '../src/game/blocks.js';
import { GameConfig } from '../src/config.js';

const S = GameConfig.SURFACE_ROWS;

function newGame(options = {}) {
  const game = new Game({ seed: 4242, ...options });
  game.start();
  return game;
}

function tick(game, seconds) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) game.update(dt);
}

function set(game, c, r, type, hp = 1, variant = 0) {
  game.grid.set(c, r, type, hp, variant);
}

// Dig straight down from the surface into row S (first underground row)
function enter(game) {
  set(game, 4, S + 1, B.DIRT);
  game.act('down');
  tick(game, 0.2);
  assert.equal(game.player.r, S);
}

test('digging dirt costs energy, ores restore it', () => {
  const game = newGame();
  const start = game.player.energy;
  enter(game);
  assert.equal(game.player.energy, start - 1);

  set(game, 4, S + 1, B.COAL);
  set(game, 4, S + 2, B.DIRT);
  game.act('down');
  tick(game, 0.2);
  assert.equal(game.player.energy, start - 1 + 2);
  assert.equal(game.stats.ores.coal, 1);
});

test('the miner cannot leave the shaft or move up', () => {
  const game = newGame();
  game.player.c = 0;
  assert.equal(game.act('left'), false);
  assert.equal(game.act('up'), false);
  assert.equal(game.player.c, 0);
});

test('TNT kills, a hard hat absorbs the blast', () => {
  const game = newGame();
  enter(game);
  set(game, 4, S + 1, B.TNT);
  game.act('down');
  assert.equal(game.state, 'dead');
  assert.equal(game.deathCause, 'tnt');

  const lucky = newGame();
  enter(lucky);
  lucky.player.shield = true;
  set(lucky, 4, S + 1, B.TNT);
  set(lucky, 4, S + 3, B.DIRT);
  lucky.act('down');
  assert.equal(lucky.state, 'playing');
  assert.equal(lucky.player.shield, false);
  tick(lucky, 0.6);
  assert.equal(lucky.player.r, S + 2, 'falls into the crater');
});

test('stone needs a pickaxe, reinforced stone needs two hits', () => {
  const game = newGame();
  enter(game);
  set(game, 4, S + 1, B.STONE);
  set(game, 3, S, B.DIRT);
  game.act('down');
  tick(game, 0.2);
  assert.equal(game.player.r, S, 'blocked without pickaxe');

  game.player.pickaxes = 1;
  set(game, 4, S + 2, B.DIRT);
  game.act('down');
  tick(game, 0.2);
  assert.equal(game.player.r, S + 1);
  assert.equal(game.player.pickaxes, 0);

  game.player.pickaxes = 2;
  set(game, 4, S + 2, B.HARDSTONE, 2);
  set(game, 4, S + 3, B.DIRT);
  game.act('down');
  tick(game, 0.2);
  assert.equal(game.player.r, S + 1, 'first hit only cracks it');
  game.act('down');
  tick(game, 0.2);
  assert.equal(game.player.r, S + 2);
});

test('out of energy with only dirt around means exhaustion', () => {
  const game = newGame();
  enter(game);
  game.player.energy = 0;
  set(game, 3, S, B.DIRT);
  set(game, 5, S, B.DIRT);
  set(game, 4, S + 1, B.DIRT);
  game.act('down');
  assert.equal(game.state, 'dead');
  assert.equal(game.deathCause, 'exhausted');
});

test('surrounded by stone without a pickaxe means trapped', () => {
  const game = newGame();
  set(game, 3, S, B.STONE);
  set(game, 5, S, B.STONE);
  set(game, 4, S + 1, B.STONE);
  game.act('down');
  assert.equal(game.state, 'dead');
  assert.equal(game.deathCause, 'trapped');
});

test('pacing in an empty pocket without energy still ends the run', () => {
  const game = newGame();
  enter(game);
  // miner at (4, S) with an empty cell to the right, dirt everywhere else
  set(game, 5, S, B.EMPTY);
  for (const [c, r] of [[3, S], [6, S], [4, S + 1], [5, S + 1]]) set(game, c, r, B.DIRT);
  game.player.energy = 0;
  game.act('right');
  assert.equal(game.state, 'dead');
  assert.equal(game.deathCause, 'exhausted');
});

test('an ore at the end of an open tunnel keeps the run alive', () => {
  const game = newGame();
  enter(game);
  set(game, 5, S, B.EMPTY);
  set(game, 6, S, B.EMPTY);
  set(game, 7, S, B.COAL);
  for (const [c, r] of [[3, S], [4, S + 1], [5, S + 1], [6, S + 1], [7, S + 1]]) set(game, c, r, B.DIRT);
  game.player.energy = 0;
  game.act('right');
  assert.equal(game.state, 'playing');
});

test('gravity pulls the miner through empty space', () => {
  const game = newGame();
  set(game, 4, S + 1, B.EMPTY);
  set(game, 4, S + 2, B.EMPTY);
  set(game, 4, S + 3, B.DIRT);
  game.act('down');
  tick(game, 1);
  assert.equal(game.player.r, S + 2);
  assert.equal(game.falling, false);
});

test('a boulder falls when undermined and crushes the miner', () => {
  const game = newGame();
  enter(game);
  set(game, 5, S, B.BOULDER);
  for (const r of [S + 1, S + 2]) {
    set(game, 4, r, B.DIRT);
    set(game, 5, r, B.DIRT);
    set(game, 6, r, B.DIRT);
  }
  set(game, 5, S + 3, B.DIRT);
  game.player.energy = 20;

  game.act('down'); // 4, S+1
  tick(game, 0.2);
  game.act('right'); // 5, S+1 directly under the boulder
  tick(game, 0.3);
  assert.equal(game.grid.get(5, S), B.BOULDER, 'miner holds the boulder up');
  game.act('down'); // 5, S+2 - boulder loses support
  tick(game, 1.5);
  assert.equal(game.state, 'dead');
  assert.equal(game.deathCause, 'crushed');
});

test('stepping aside lets the boulder drop past', () => {
  const game = newGame();
  enter(game);
  set(game, 5, S, B.BOULDER);
  for (const r of [S + 1, S + 2]) {
    set(game, 4, r, B.DIRT);
    set(game, 5, r, B.DIRT);
    set(game, 6, r, B.DIRT);
  }
  set(game, 5, S + 3, B.DIRT);
  set(game, 6, S + 3, B.DIRT);
  game.player.energy = 20;

  game.act('down');
  tick(game, 0.2);
  game.act('right');
  tick(game, 0.2);
  game.act('down');
  tick(game, 0.2);
  game.act('right'); // escape to 6, S+2
  tick(game, 1.5);
  assert.equal(game.state, 'playing');
  assert.equal(game.grid.get(5, S + 2), B.BOULDER, 'boulder came to rest in the old spot');
});

test('a falling boulder is solid - the miner cannot step into it', () => {
  const game = newGame();
  enter(game);
  // miner at (4, S+1) next to an empty column under a boulder
  set(game, 4, S + 1, B.EMPTY);
  set(game, 4, S + 2, B.DIRT);
  game.player.r = S + 1;
  set(game, 5, S, B.BOULDER);
  set(game, 5, S + 1, B.EMPTY);
  set(game, 5, S + 2, B.EMPTY);
  set(game, 5, S + 3, B.DIRT);
  let t = 0;
  while (!game.boulderAt(5, S + 1) && t < 3) {
    game.update(1 / 60);
    t += 1 / 60;
  }
  assert.ok(game.boulderAt(5, S + 1), 'boulder is falling past the miner');
  game.cooldown = 0;
  assert.equal(game.act('right'), false);
  assert.equal(game.player.c, 4);
  tick(game, 1);
  assert.equal(game.grid.get(5, S + 2), B.BOULDER);
  assert.equal(game.grid.get(game.player.c, game.player.r), B.EMPTY);
});

test('monsters wake up, hunt through open space and kill on contact', () => {
  const game = newGame();
  enter(game);
  // open corridor to the right of the miner
  for (let c = 5; c < 9; c++) set(game, c, S, B.EMPTY);
  set(game, 5, S + 1, B.DIRT);
  set(game, 6, S + 1, B.DIRT);
  set(game, 7, S + 1, B.DIRT);
  set(game, 8, S + 1, B.DIRT);
  const m = new Monster(1, 8, S, 'crawler');
  game.monsters.push(m);
  tick(game, 4);
  assert.equal(game.state, 'dead');
  assert.equal(game.deathCause, 'monster');
});

test('a hard hat bonks a monster', () => {
  const game = newGame();
  enter(game);
  game.player.shield = true;
  for (let c = 5; c < 9; c++) set(game, c, S, B.EMPTY);
  for (let c = 5; c < 9; c++) set(game, c, S + 1, B.DIRT);
  game.monsters.push(new Monster(1, 7, S, 'crawler'));
  tick(game, 4);
  assert.equal(game.state, 'playing');
  assert.equal(game.player.shield, false);
  assert.equal(game.monsters.length, 0);
  assert.equal(game.stats.monstersKilled, 1);
});

test('torches advance the page and reveal the next section', () => {
  const game = newGame();
  const torch = game.targetTorch;
  assert.ok(torch);
  // teleport next to the torch
  game.player.c = torch.c;
  game.player.r = torch.r - 1;
  set(game, torch.c, torch.r - 1, B.EMPTY);
  game.surfaceLight = 0;
  game.act('down');
  assert.equal(game.pageTop, torch.r - GameConfig.ROWS_ABOVE_PLAYER);
  assert.equal(game.reveal.kind, 'page');
  tick(game, GameConfig.SCROLL_TIME + 0.4);
  assert.ok(game.revealLevel > 0.9, `reveal level ${game.revealLevel}`);
  assert.ok(game.targetTorch.r > torch.r);
});

test('a torch grabbed from the side lights up the section right away', () => {
  const game = newGame();
  const torch = game.targetTorch;
  const side = torch.c > 0 ? torch.c - 1 : torch.c + 1;
  const dir = side < torch.c ? 'right' : 'left';
  // reach the torch row in the neighbouring column first
  game.player.c = side;
  game.player.r = torch.r - 1;
  set(game, side, torch.r - 1, B.EMPTY);
  set(game, side, torch.r, B.DIRT);
  set(game, side, torch.r + 1, B.DIRT);
  game.surfaceLight = 0;
  game.act('down');
  assert.equal(game.reveal.kind, null, 'passing the row alone gives no reveal');
  tick(game, GameConfig.SCROLL_TIME + 0.2);
  game.act(dir);
  assert.equal(game.reveal.kind, 'page');
  tick(game, 0.3);
  assert.ok(game.revealLevel > 0.9);
});

test('a flare does not cut a torch reveal short', () => {
  const game = newGame();
  const torch = game.targetTorch;
  game.player.c = torch.c;
  game.player.r = torch.r - 1;
  game.player.flares = 1;
  set(game, torch.c, torch.r - 1, B.EMPTY);
  game.surfaceLight = 0;
  game.act('down');
  tick(game, GameConfig.SCROLL_TIME + 0.7);
  const left = game.reveal.timer;
  assert.equal(game.act('flare'), false);
  assert.equal(game.player.flares, 1);
  assert.equal(game.reveal.kind, 'page');
  assert.ok(Math.abs(game.reveal.timer - left) < 0.01);
});

test('quick ore streaks build a combo multiplier', () => {
  const game = newGame();
  enter(game);
  for (let i = 1; i <= 4; i++) set(game, 4, S + i, B.IRON);
  set(game, 4, S + 5, B.DIRT);
  for (let i = 0; i < 4; i++) {
    game.act('down');
    tick(game, 0.2);
  }
  assert.equal(game.combo, 4);
  assert.equal(game.comboMultiplier, 1.75);
});

test('TNT chain reactions', () => {
  const game = newGame();
  enter(game);
  game.player.shield = true;
  set(game, 4, S + 1, B.TNT);
  set(game, 4, S + 2, B.TNT);
  set(game, 4, S + 4, B.DIRT);
  game.act('down');
  tick(game, 1);
  assert.equal(game.stats.chainReactions, 1);
});

// --------------------------------------------------------------- bot fuzzing

const DIRS = { left: [-1, 0], right: [1, 0], down: [0, 1] };

function botChoose(game, rand) {
  const p = game.player;
  let best = null;
  let bestScore = -Infinity;
  for (const [dir, [dc, dr]] of Object.entries(DIRS)) {
    const c = p.c + dc;
    const r = p.r + dr;
    if (c < 0 || c >= GameConfig.COLS) continue;
    const t = game.grid.get(c, r);
    const info = blockInfo(t);
    let s = rand() * 3;
    if (info.dig === Dig.DEADLY) s -= 100;
    else if (info.dig === Dig.FREE) s += 10;
    else if (info.dig === Dig.SOFT) s += p.energy >= info.cost ? 3 : -50;
    else if (info.dig === Dig.NONE) s += 2;
    else if (info.dig === Dig.HARD) s += p.pickaxes > 0 ? 1 : -50;
    if (dir === 'down') s += 2.5;
    if (s > bestScore) {
      bestScore = s;
      best = dir;
    }
  }
  return best;
}

test('bot fuzzing: thousands of moves keep the rules consistent', () => {
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const causes = {};
  let totalDepth = 0;
  const runs = 150;

  for (let run = 0; run < runs; run++) {
    const game = new Game({ seed: run * 101 + 3, upgrades: { stamina: run % 6, toolbelt: run % 3 } });
    game.start();
    let lastScore = 0;
    const dt = 1 / 30;
    for (let step = 0; step < 6000 && game.state === 'playing'; step++) {
      if (!game.isBusy() && rand() < 0.5) {
        if (game.player.flares > 0 && rand() < 0.02) game.act('flare');
        else game.act(botChoose(game, rand));
      }
      game.update(dt);

      const p = game.player;
      assert.ok(p.c >= 0 && p.c < GameConfig.COLS);
      assert.ok(p.energy >= 0);
      assert.ok(game.score >= lastScore);
      lastScore = game.score;
      if (p.alive) {
        assert.equal(game.grid.get(p.c, p.r), B.EMPTY, `miner inside a block at ${p.c},${p.r}`);
      }
      for (const m of game.monsters) {
        assert.equal(game.grid.get(m.c, m.r), B.EMPTY, 'monster inside a block');
      }
    }
    causes[game.deathCause || 'alive'] = (causes[game.deathCause || 'alive'] || 0) + 1;
    totalDepth += game.maxDepth;
    const results = game.getResults();
    assert.ok(results.coins.total >= 0);
  }
  console.log('bot results:', causes, 'avg depth', Math.round(totalDepth / runs));
});
