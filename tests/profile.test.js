import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Profile } from '../src/game/profile.js';
import { UPGRADES } from '../src/game/progression.js';
import { Game } from '../src/game/game.js';

// In-memory localStorage for node
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
};

function freshProfile() {
  store.clear();
  return new Profile();
}

function results(overrides = {}) {
  const game = new Game({ seed: 1 });
  const r = game.getResults();
  return {
    ...r,
    cause: 'tnt',
    score: 1200,
    depth: 30,
    ...overrides,
    stats: { ...r.stats, blocksDug: 20, time: 60, ...(overrides.stats || {}) },
    coins: overrides.coins || { ores: 10, bonus: 0, depth: 6, total: 16 }
  };
}

test('a run adds coins, stats and a scoreboard entry', () => {
  const p = freshProfile();
  const summary = p.recordRun(results());
  assert.equal(p.data.stats.runs, 1);
  assert.equal(p.data.stats.bestDepth, 30);
  assert.equal(summary.rank, 1);
  assert.ok(summary.newBestScore);
  // run coins plus achievement rewards (first dig, 25 m)
  const achievementCoins = summary.unlocked.reduce((s, a) => s + a.coins, 0);
  assert.equal(p.coins, 16 + achievementCoins);
  assert.ok(summary.unlocked.some(a => a.id === 'first_dig'));
  assert.ok(summary.unlocked.some(a => a.id === 'depth_25'));
});

test('achievements are only awarded once', () => {
  const p = freshProfile();
  p.recordRun(results());
  const coins = p.coins;
  const again = p.recordRun(results({ coins: { ores: 0, bonus: 0, depth: 0, total: 0 } }));
  assert.equal(again.unlocked.length, 0);
  assert.equal(p.coins, coins);
});

test('scoreboard keeps the best ten, sorted', () => {
  const p = freshProfile();
  for (let i = 1; i <= 14; i++) p.recordRun(results({ score: i * 100 }));
  const scores = p.data.scores.map(s => s.score);
  assert.equal(scores.length, 10);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  assert.equal(scores[0], 1400);
  assert.equal(scores[9], 500);
});

test('upgrades cost coins and stop at the max level', () => {
  const p = freshProfile();
  const stamina = UPGRADES.find(u => u.id === 'stamina');
  assert.equal(p.buy('stamina'), false, 'cannot buy without coins');
  p.data.coins = 10000;
  for (const cost of stamina.costs) {
    const before = p.coins;
    assert.equal(p.buy('stamina'), true);
    assert.equal(p.coins, before - cost);
  }
  assert.equal(p.level('stamina'), stamina.costs.length);
  assert.equal(p.buy('stamina'), false, 'maxed out');
  const game = new Game({ seed: 3, upgrades: p.upgrades });
  assert.equal(game.player.energy, 10 + 2 * stamina.costs.length);
});

test('daily dig tracks the best score of the day', () => {
  const p = freshProfile();
  const first = p.recordRun(results({ mode: 'daily', score: 900 }));
  assert.ok(first.dailyBest);
  assert.ok(first.unlocked.some(a => a.id === 'daily'));
  const worse = p.recordRun(results({ mode: 'daily', score: 400 }));
  assert.equal(worse.dailyBest, false);
  assert.equal(p.dailyInfo().best, 900);
  assert.equal(p.dailyInfo().attempts, 2);
});

test('progress survives a reload and can be reset', () => {
  const p = freshProfile();
  p.recordRun(results());
  p.data.coins = 321;
  p.save();
  const reloaded = new Profile();
  assert.equal(reloaded.coins, 321);
  assert.equal(reloaded.data.stats.runs, 1);
  reloaded.reset();
  assert.equal(new Profile().data.stats.runs, 0);
});
