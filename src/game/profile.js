/*
  Player profile (coins, upgrades, achievements, stats, high scores) and
  settings, persisted in localStorage.
*/

import { load, save, remove } from '../core/storage.js';
import { todayKey } from '../core/rng.js';
import { UPGRADES, ACHIEVEMENTS, upgradeCost } from './progression.js';

const PROFILE_KEY = 'miners.v2.profile';
const SETTINGS_KEY = 'miners.v2.settings';
const MAX_SCORES = 10;

function defaultStats() {
  return {
    runs: 0,
    bestDepth: 0,
    bestScore: 0,
    totalDepth: 0,
    totalScore: 0,
    playTime: 0,
    ores: { coal: 0, iron: 0, gold: 0, diamond: 0 },
    gems: [0, 0, 0, 0, 0],
    torches: 0,
    chests: 0,
    monstersKilled: 0,
    blocksDug: 0,
    deaths: {}
  };
}

function defaultProfile() {
  return {
    version: 1,
    name: 'MINER',
    coins: 0,
    upgrades: Object.fromEntries(UPGRADES.map(u => [u.id, 0])),
    achievements: {},
    stats: defaultStats(),
    scores: [],
    daily: { date: null, best: 0, depth: 0, attempts: 0 },
    tutorial: { done: false, seen: {} }
  };
}

export function defaultSettings() {
  return {
    master: 0.8,
    music: 0.5,
    sfx: 0.8,
    muted: false,
    haptics: true,
    quality: 'auto',
    shake: !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches),
    touchControls: 'auto',
    showHints: true
  };
}

export class Profile {
  constructor() {
    const stored = load(PROFILE_KEY, null);
    const base = defaultProfile();
    this.data = stored ? { ...base, ...stored } : base;
    this.data.upgrades = { ...base.upgrades, ...(this.data.upgrades || {}) };
    this.data.stats = { ...defaultStats(), ...(this.data.stats || {}) };
    this.data.stats.ores = { ...defaultStats().ores, ...(this.data.stats.ores || {}) };
    this.data.tutorial = { ...base.tutorial, ...(this.data.tutorial || {}) };
    this.data.daily = { ...base.daily, ...(this.data.daily || {}) };
    if (!stored) this.importLegacy();
    this.settings = { ...defaultSettings(), ...load(SETTINGS_KEY, {}) };
  }

  // Scores from the original 2D version (same origin only)
  importLegacy() {
    const legacy = load('miners_scoreboard', null);
    if (Array.isArray(legacy)) {
      for (const s of legacy) {
        if (typeof s.score === 'number') {
          this.data.scores.push({ name: String(s.name || 'MINER').slice(0, 10), score: s.score, depth: s.depth || 0, date: s.date || '', legacy: true });
        }
      }
      this.data.scores.sort((a, b) => b.score - a.score);
      this.data.scores = this.data.scores.slice(0, MAX_SCORES);
    }
    const legacySettings = load('miners_settings', null);
    if (legacySettings) {
      const s = { ...defaultSettings() };
      if (typeof legacySettings.fxVolume === 'number') s.sfx = legacySettings.fxVolume;
      if (typeof legacySettings.musicVolume === 'number') s.music = legacySettings.musicVolume;
      save(SETTINGS_KEY, { ...s, ...load(SETTINGS_KEY, {}) });
    }
    this.save();
  }

  save() {
    save(PROFILE_KEY, this.data);
  }

  saveSettings() {
    save(SETTINGS_KEY, this.settings);
  }

  get coins() {
    return this.data.coins;
  }

  get upgrades() {
    return this.data.upgrades;
  }

  level(id) {
    return this.data.upgrades[id] || 0;
  }

  buy(id) {
    const upgrade = UPGRADES.find(u => u.id === id);
    if (!upgrade) return false;
    const cost = upgradeCost(upgrade, this.level(id));
    if (cost == null || this.data.coins < cost) return false;
    this.data.coins -= cost;
    this.data.upgrades[id] = this.level(id) + 1;
    this.save();
    return true;
  }

  // Bookkeeping after a run. Returns the summary shown on the results screen.
  recordRun(results) {
    const d = this.data;
    const st = d.stats;
    const prevBestScore = st.bestScore;
    const prevBestDepth = st.bestDepth;

    st.runs++;
    st.totalDepth += results.depth;
    st.totalScore += results.score;
    st.playTime += results.stats.time;
    st.bestDepth = Math.max(st.bestDepth, results.depth);
    st.bestScore = Math.max(st.bestScore, results.score);
    for (const k of Object.keys(st.ores)) st.ores[k] += results.stats.ores[k] || 0;
    results.stats.gems.forEach((n, i) => { st.gems[i] = (st.gems[i] || 0) + n; });
    st.torches += results.stats.torches;
    st.chests += results.stats.chests;
    st.monstersKilled += results.stats.monstersKilled;
    st.blocksDug += results.stats.blocksDug;
    st.deaths[results.cause] = (st.deaths[results.cause] || 0) + 1;

    let rank = null;
    if (results.score > 0) {
      const entry = { name: d.name, score: results.score, depth: results.depth, date: todayKey(), daily: results.mode === 'daily' };
      d.scores.push(entry);
      d.scores.sort((a, b) => b.score - a.score);
      d.scores = d.scores.slice(0, MAX_SCORES);
      const idx = d.scores.indexOf(entry);
      rank = idx >= 0 ? idx + 1 : null;
    }

    let dailyBest = false;
    if (results.mode === 'daily') {
      const today = todayKey();
      if (d.daily.date !== today) d.daily = { date: today, best: 0, depth: 0, attempts: 0 };
      d.daily.attempts++;
      if (results.score > d.daily.best) {
        d.daily.best = results.score;
        d.daily.depth = results.depth;
        dailyBest = true;
      }
    }

    d.coins += results.coins.total;
    const unlocked = this.checkAchievements({ run: { ...results, finished: true } });
    this.save();

    return {
      rank,
      newBestScore: results.score > prevBestScore,
      newBestDepth: results.depth > prevBestDepth,
      dailyBest,
      unlocked,
      achievementCoins: unlocked.reduce((sum, a) => sum + a.coins, 0)
    };
  }

  checkAchievements(context = {}) {
    const unlocked = [];
    const ctx = {
      run: context.run || { stats: { ores: {}, gems: [], blocksDug: 0 }, depth: 0, score: 0 },
      life: this.data.stats,
      profile: this.data
    };
    for (const a of ACHIEVEMENTS) {
      if (this.data.achievements[a.id]) continue;
      let ok = false;
      try {
        ok = a.check(ctx);
      } catch (e) {
        ok = false;
      }
      if (ok) {
        this.data.achievements[a.id] = Date.now();
        this.data.coins += a.coins;
        unlocked.push(a);
      }
    }
    if (unlocked.length) this.save();
    return unlocked;
  }

  dailyInfo() {
    const today = todayKey();
    if (this.data.daily.date !== today) return { date: today, best: 0, depth: 0, attempts: 0 };
    return this.data.daily;
  }

  markHint(id) {
    this.data.tutorial.seen[id] = true;
    this.save();
  }

  hintSeen(id) {
    return !!this.data.tutorial.seen[id];
  }

  reset() {
    this.data = defaultProfile();
    remove(PROFILE_KEY);
    this.save();
  }
}
