import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from '../src/game/grid.js';
import { LevelGenerator } from '../src/game/levelgen.js';
import { B } from '../src/game/blocks.js';
import { GameConfig } from '../src/config.js';

function snapshot(grid, rows) {
  const out = [];
  for (let r = GameConfig.SURFACE_ROWS; r <= rows; r++) {
    const row = grid.rows.get(r);
    out.push(Array.from(row.type).join(','));
  }
  return out.join('|');
}

test('same seed generates the same mine regardless of request pattern', () => {
  const a = new Grid();
  const genA = new LevelGenerator(a, 12345);
  genA.ensure(400);

  const b = new Grid();
  const genB = new LevelGenerator(b, 12345);
  for (let r = 5; r <= 400; r += 7) genB.ensure(r);
  genB.ensure(400);

  assert.equal(snapshot(a, 400), snapshot(b, 400));
  assert.deepEqual(genA.torches, genB.torches);
  assert.deepEqual(genA.pendingMonsters, genB.pendingMonsters);
});

test('different seeds generate different mines', () => {
  const a = new Grid();
  new LevelGenerator(a, 1).ensure(100);
  const b = new Grid();
  new LevelGenerator(b, 2).ensure(100);
  assert.notEqual(snapshot(a, 100), snapshot(b, 100));
});

test('every torch is reachable from the previous one without a pickaxe', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const grid = new Grid();
    const gen = new LevelGenerator(grid, seed * 7919);
    gen.ensure(500);
    let anchor = { c: GameConfig.START_COL, r: GameConfig.SURFACE_ROWS - 1 };
    for (const torch of gen.torches) {
      if (torch.r > 480) break;
      assert.equal(grid.get(torch.c, torch.r), B.TORCH, `torch missing (seed ${seed})`);
      assert.ok(gen.hasPath(anchor, torch), `no path to torch at ${torch.c},${torch.r} (seed ${seed})`);
      anchor = torch;
    }
  }
});

test('torches are spaced so the next one fits on screen', () => {
  const grid = new Grid();
  const gen = new LevelGenerator(grid, 99);
  gen.ensure(800);
  let prev = GameConfig.SURFACE_ROWS - 1;
  for (const torch of gen.torches) {
    const gap = torch.r - prev;
    assert.ok(gap >= 7 && gap <= 12, `gap ${gap}`);
    prev = torch.r;
  }
});

test('no TNT directly around torches and no full TNT rows', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const grid = new Grid();
    const gen = new LevelGenerator(grid, seed);
    gen.ensure(400);
    for (const t of gen.torches) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dc === 0 && dr === 0) continue;
          assert.notEqual(grid.get(t.c + dc, t.r + dr), B.TNT);
        }
      }
    }
    for (let r = GameConfig.SURFACE_ROWS; r < 395; r++) {
      let tnt = 0;
      for (let c = 0; c < GameConfig.COLS; c++) if (grid.get(c, r) === B.TNT) tnt++;
      assert.ok(tnt <= GameConfig.COLS - 3, `row ${r} has ${tnt} TNT`);
    }
  }
});

test('first row is plain dirt and boulders never float', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const grid = new Grid();
    const gen = new LevelGenerator(grid, seed);
    gen.ensure(400);
    for (let c = 0; c < GameConfig.COLS; c++) {
      assert.equal(grid.get(c, GameConfig.SURFACE_ROWS), B.DIRT);
    }
    for (let r = GameConfig.SURFACE_ROWS; r < 395; r++) {
      for (let c = 0; c < GameConfig.COLS; c++) {
        if (grid.get(c, r) === B.BOULDER) {
          assert.notEqual(grid.get(c, r + 1), B.EMPTY, `floating boulder at ${c},${r} seed ${seed}`);
        }
      }
    }
  }
});

test('deep layers contain the expected block types', () => {
  const counts = {};
  for (let seed = 1; seed <= 10; seed++) {
    const grid = new Grid();
    new LevelGenerator(grid, seed).ensure(260);
    for (let r = GameConfig.SURFACE_ROWS; r < 255; r++) {
      for (let c = 0; c < GameConfig.COLS; c++) {
        const t = grid.get(c, r);
        counts[t] = (counts[t] || 0) + 1;
      }
    }
  }
  for (const type of [B.DIRT, B.COAL, B.IRON, B.GOLD, B.DIAMOND, B.STONE, B.HARDSTONE, B.OBSIDIAN,
    B.TNT, B.TORCH, B.BOULDER, B.MAGMA, B.PICKAXE, B.FLARE, B.CHEST]) {
    assert.ok(counts[type] > 0, `block type ${type} never generated`);
  }
});
