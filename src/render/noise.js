/*
  Tileable noise helpers for procedural textures
*/

import { Rng } from '../core/rng.js';

export class TileNoise {
  constructor(seed, period) {
    this.period = period;
    const rng = new Rng(seed);
    this.values = new Float32Array(period * period);
    for (let i = 0; i < this.values.length; i++) this.values[i] = rng.next();
  }

  // x, y in lattice units; wraps every `period` units
  sample(x, y) {
    const p = this.period;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const x0 = ((xi % p) + p) % p;
    const y0 = ((yi % p) + p) % p;
    const x1 = (x0 + 1) % p;
    const y1 = (y0 + 1) % p;
    const v = this.values;
    const a = v[y0 * p + x0];
    const b = v[y0 * p + x1];
    const c = v[y1 * p + x0];
    const d = v[y1 * p + x1];
    const u = xf * xf * (3 - 2 * xf);
    const w = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  }
}

// Fractal noise over the unit square, tileable. Returns a value in [0, 1].
export function makeFbm(seed, basePeriod, octaves = 4, gain = 0.5) {
  const layers = [];
  for (let i = 0; i < octaves; i++) layers.push(new TileNoise(seed + i * 1013, basePeriod << i));
  return (u, v) => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    for (let i = 0; i < layers.length; i++) {
      const n = layers[i];
      sum += n.sample(u * n.period, v * n.period) * amp;
      norm += amp;
      amp *= gain;
    }
    return sum / norm;
  };
}

// Tileable cellular noise: returns distances to the nearest (f1) and second
// nearest (f2) feature point plus the id of the nearest cell.
export function makeCells(seed, count) {
  const rng = new Rng(seed);
  const pts = [];
  for (let i = 0; i < count; i++) pts.push({ x: rng.next(), y: rng.next(), v: rng.next() });
  const out = { f1: 0, f2: 0, id: 0, v: 0 };
  return (u, v) => {
    let f1 = 9;
    let f2 = 9;
    let id = 0;
    for (let i = 0; i < pts.length; i++) {
      let dx = Math.abs(u - pts[i].x);
      let dy = Math.abs(v - pts[i].y);
      if (dx > 0.5) dx = 1 - dx;
      if (dy > 0.5) dy = 1 - dy;
      const d = dx * dx + dy * dy;
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = i;
      } else if (d < f2) {
        f2 = d;
      }
    }
    out.f1 = Math.sqrt(f1);
    out.f2 = Math.sqrt(f2);
    out.id = id;
    out.v = pts[id].v;
    return out;
  };
}

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function scaleRgb(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
