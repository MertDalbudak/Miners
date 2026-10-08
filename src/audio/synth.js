/*
  Procedural sound effects rendered into AudioBuffers at startup.
*/

function make(ctx, duration, fn, channels = 1) {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(duration * rate));
  const buffer = ctx.createBuffer(channels, length, rate);
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    const state = {};
    for (let i = 0; i < length; i++) data[i] = fn(i / rate, i, state, ch);
  }
  // soft limit
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = Math.tanh(data[i] * 1.2);
  }
  return buffer;
}

const TAU = Math.PI * 2;
const noise = () => Math.random() * 2 - 1;

// One-pole low-pass on a per-sound state slot
function lp(state, key, x, cutoff, rate = 48000) {
  const a = 1 - Math.exp((-TAU * cutoff) / rate);
  state[key] = (state[key] || 0) + a * (x - (state[key] || 0));
  return state[key];
}

function env(t, attack, decay) {
  if (t < attack) return t / attack;
  return Math.exp(-(t - attack) * decay);
}

const tri = p => 1 - 4 * Math.abs(Math.round(p - 0.25) - (p - 0.25));
const sq = p => (p % 1 < 0.5 ? 1 : -1);

function notes(ctx, list, wave = tri, dur = 0.16, gap = 0.08, decay = 9, gain = 0.4) {
  const total = list.length * gap + dur + 0.3;
  return make(ctx, total, t => {
    let s = 0;
    list.forEach((f, i) => {
      const nt = t - i * gap;
      if (nt < 0 || nt > dur + 0.3) return;
      s += wave(f * nt) * env(nt, 0.004, decay) * gain;
      s += Math.sin(TAU * f * 2 * nt) * env(nt, 0.004, decay * 1.6) * gain * 0.25;
    });
    return s;
  });
}

export function generateSfx(ctx) {
  const R = ctx.sampleRate;
  const b = {};

  b.stone_hit = make(ctx, 0.35, (t, i, st) => {
    const e = env(t, 0.001, 22);
    const metal = Math.sin(TAU * 1240 * t) * 0.35 + Math.sin(TAU * 1873 * t) * 0.25 + Math.sin(TAU * 2671 * t) * 0.15;
    const thud = Math.sin(TAU * (120 - t * 160) * t) * env(t, 0.001, 30);
    return (metal * e + thud * 0.6 + lp(st, 'n', noise(), 3000, R) * env(t, 0, 60) * 0.5) * 0.7;
  });

  b.stone_break = make(ctx, 0.5, (t, i, st) => {
    const crunch = lp(st, 'n', noise(), 1800, R) * env(t, 0.002, 9);
    const thump = Math.sin(TAU * (90 - t * 80) * t) * env(t, 0.001, 14);
    const crack = noise() * env(t, 0, 45) * 0.6;
    return (crunch * 0.9 + thump * 0.8 + crack) * 0.75;
  });

  b.dig_soft = make(ctx, 0.22, (t, i, st) => {
    const n = lp(st, 'n', noise(), 900, R);
    return (n * env(t, 0.003, 18) * 1.4 + Math.sin(TAU * 80 * t) * env(t, 0, 30) * 0.4) * 0.8;
  });

  b.fall = make(ctx, 0.45, (t, i, st) => {
    const cutoff = 400 + 2400 * (t / 0.45);
    return lp(st, 'n', noise(), cutoff, R) * Math.sin(Math.PI * Math.min(1, t / 0.45)) * 0.6;
  });

  b.land = make(ctx, 0.3, (t, i, st) => {
    return (Math.sin(TAU * (70 - t * 60) * t) * env(t, 0.002, 16) + lp(st, 'n', noise(), 600, R) * env(t, 0.002, 20) * 0.8) * 0.9;
  });

  b.step = make(ctx, 0.08, (t, i, st) => lp(st, 'n', noise(), 1400, R) * env(t, 0.001, 70) * 0.6);

  b.bump = make(ctx, 0.25, t => (sq(110 * t) * 0.3 + Math.sin(TAU * 55 * t) * 0.5) * env(t, 0.004, 14) * 0.6);

  b.monster_wake = make(ctx, 0.75, (t, i, st) => {
    const f = 220 + 900 * Math.min(1, t / 0.25) - 300 * Math.max(0, t - 0.25);
    const mod = Math.sin(TAU * 37 * t) * 40;
    const saw = ((f + mod) * t) % 1 * 2 - 1;
    return lp(st, 'a', saw, 2400, R) * env(t, 0.02, 3.5) * 0.55 + lp(st, 'b', noise(), 900, R) * env(t, 0.01, 6) * 0.3;
  });

  b.monster_step = make(ctx, 0.18, (t, i, st) => {
    const f = 70 + Math.sin(TAU * 12 * t) * 20;
    return (Math.sin(TAU * f * t) * 0.5 + lp(st, 'n', noise(), 500, R) * 0.4) * env(t, 0.005, 18);
  });

  b.chomp = make(ctx, 0.35, (t, i, st) => {
    const a = lp(st, 'n', noise(), 1100, R) * (env(t, 0.001, 30) + (t > 0.13 ? env(t - 0.13, 0.001, 25) : 0));
    return (a + Math.sin(TAU * 95 * t) * env(t, 0.001, 12) * 0.6) * 0.9;
  });

  b.monster_die = make(ctx, 0.6, (t, i, st) => {
    const f = 500 * Math.exp(-t * 4);
    return (Math.sin(TAU * f * t) * 0.5 + lp(st, 'n', noise(), 1500, R) * 0.4) * env(t, 0.005, 5);
  });

  b.rumble = make(ctx, 0.9, (t, i, st) => {
    const n = lp(st, 'a', lp(st, 'b', noise(), 240, R), 160, R);
    return n * 2.8 * Math.sin(Math.PI * t / 0.9) * (0.8 + 0.2 * Math.sin(TAU * 18 * t));
  });

  b.boulder_impact = make(ctx, 0.7, (t, i, st) => {
    return (Math.sin(TAU * (60 - t * 30) * t) * env(t, 0.002, 7) + lp(st, 'n', noise(), 700, R) * env(t, 0.001, 10) * 0.9) * 0.95;
  });

  b.boom = make(ctx, 1.4, (t, i, st) => {
    const low = Math.sin(TAU * (55 - t * 25) * t) * env(t, 0.004, 3.2);
    const n = lp(st, 'n', noise(), 900 - t * 500, R) * env(t, 0.002, 2.8);
    return (low * 0.9 + n * 1.1) * 0.9;
  });

  b.fuse = make(ctx, 0.25, (t, i, st) => (noise() - lp(st, 'n', noise(), 3000, R)) * env(t, 0.01, 8) * 0.4);

  b.shield = make(ctx, 0.9, (t, i, st) => {
    const ding = Math.sin(TAU * 1568 * t) * 0.4 + Math.sin(TAU * 2349 * t) * 0.25;
    const shatter = noise() * env(t, 0, 18) * 0.5;
    return ding * env(t, 0.002, 4.5) + shatter;
  });

  b.chest = notes(ctx, [523.25, 659.25, 783.99, 1046.5, 1318.5], tri, 0.2, 0.07, 7, 0.38);
  b.coin = notes(ctx, [987.77, 1318.5], sq, 0.1, 0.06, 18, 0.18);
  b.pluck = notes(ctx, [880], tri, 0.18, 0.05, 14, 0.45);
  b.click = make(ctx, 0.05, (t, i, st) => lp(st, 'n', noise(), 4000, R) * env(t, 0.0005, 120) * 0.5 + Math.sin(TAU * 1800 * t) * env(t, 0, 90) * 0.25);
  b.hover = make(ctx, 0.04, t => Math.sin(TAU * 2400 * t) * env(t, 0, 140) * 0.12);
  b.back = notes(ctx, [659.25, 523.25], tri, 0.1, 0.05, 20, 0.25);
  b.buy = notes(ctx, [523.25, 783.99, 1046.5], sq, 0.12, 0.06, 12, 0.18);
  b.denied = make(ctx, 0.3, t => (sq(98 * t) * 0.25 + sq(104 * t) * 0.25) * env(t, 0.005, 9));
  b.milestone = notes(ctx, [392, 523.25, 659.25, 783.99, 1046.5], tri, 0.35, 0.09, 4, 0.36);
  b.achievement = notes(ctx, [783.99, 1046.5, 1318.5, 1567.98], tri, 0.3, 0.08, 5, 0.32);
  b.low_energy = notes(ctx, [440, 440], sq, 0.07, 0.12, 25, 0.12);
  b.game_over = make(ctx, 1.6, t => {
    const seq = [392, 349.23, 311.13, 261.63];
    const idx = Math.min(3, Math.floor(t / 0.3));
    const nt = t - idx * 0.3;
    const f = seq[idx];
    const vib = Math.sin(TAU * 5 * t) * 3;
    return (tri((f + vib) * t) * 0.5 + Math.sin(TAU * (f / 2) * t) * 0.3) * env(nt, 0.01, idx === 3 ? 1.5 : 4) * 0.7;
  });
  b.reveal = make(ctx, 1.4, t => {
    let s = 0;
    for (const [f, d] of [[1046.5, 0], [1318.5, 0.06], [1567.98, 0.12], [2093, 0.18]]) {
      const nt = t - d;
      if (nt > 0) s += Math.sin(TAU * f * nt) * env(nt, 0.01, 3) * 0.16;
    }
    return s;
  });
  b.flare = make(ctx, 1.0, (t, i, st) => {
    const hiss = (noise() - lp(st, 'n', noise(), 1500, R)) * 0.5;
    const whoosh = lp(st, 'w', noise(), 300 + t * 3000, R);
    return (hiss * env(t, 0.02, 2.5) + whoosh * Math.sin(Math.PI * Math.min(1, t * 2)) * 0.7) * 0.7;
  });
  b.heartbeat = make(ctx, 0.5, t => {
    const beat = (tt) => (tt > 0 ? Math.sin(TAU * 55 * tt) * env(tt, 0.004, 22) : 0);
    return (beat(t) + beat(t - 0.17) * 0.7) * 0.9;
  });
  b.drip = make(ctx, 0.3, t => {
    const f = 1400 + 900 * Math.exp(-t * 30);
    return Math.sin(TAU * f * t) * env(t, 0.001, 18) * 0.25;
  });

  return b;
}
