/*
  Procedural textures - every surface in the game is painted in code.
  Colors are authored in sRGB; normal maps are derived from height fields.
*/

import * as pc from 'playcanvas';
import { Rng } from '../core/rng.js';
import { makeFbm, makeCells, hexToRgb, mixRgb, smoothstep } from './noise.js';
import { BIOMES } from '../game/biomes.js';

export function createCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

// A paintable RGB + height buffer that wraps around its edges (tileable)
class Surface {
  constructor(w, h = w) {
    this.w = w;
    this.h = h;
    this.r = new Float32Array(w * h);
    this.g = new Float32Array(w * h);
    this.b = new Float32Array(w * h);
    this.a = null;
    this.height = new Float32Array(w * h);
    this.emissive = null;
  }

  fill(fn) {
    const { w, h } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const res = fn(x / w, y / h, x, y);
        this.r[i] = res[0];
        this.g[i] = res[1];
        this.b[i] = res[2];
        if (res.length > 3) this.height[i] = res[3];
      }
    }
  }

  // Soft-edged ellipse that wraps around texture borders
  blob(cx, cy, rx, ry, color, heightAdd = 0, shade = 0.25, alpha = 1) {
    const { w, h } = this;
    const x0 = Math.floor(cx - rx - 1);
    const x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1);
    const y1 = Math.ceil(cy + ry + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        const px = ((x % w) + w) % w;
        const py = ((y % h) + h) % h;
        const i = py * w + px;
        const edge = smoothstep(1, 0.6, d) * alpha;
        // simple top-left lighting on the pebble
        const light = 1 + shade * (-dx - dy) * 0.5 - shade * d * 0.5;
        this.r[i] += (color[0] * light - this.r[i]) * edge;
        this.g[i] += (color[1] * light - this.g[i]) * edge;
        this.b[i] += (color[2] * light - this.b[i]) * edge;
        this.height[i] += heightAdd * Math.sqrt(Math.max(0, 1 - d)) * edge;
      }
    }
  }

  toCanvas() {
    const { w, h } = this;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let i = 0; i < w * h; i++) {
      d[i * 4] = Math.max(0, Math.min(255, this.r[i] * 255));
      d[i * 4 + 1] = Math.max(0, Math.min(255, this.g[i] * 255));
      d[i * 4 + 2] = Math.max(0, Math.min(255, this.b[i] * 255));
      d[i * 4 + 3] = this.a ? Math.max(0, Math.min(255, this.a[i] * 255)) : 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  emissiveCanvas() {
    const { w, h } = this;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const e = this.emissive;
    for (let i = 0; i < w * h; i++) {
      d[i * 4] = Math.min(255, e[i * 3] * 255);
      d[i * 4 + 1] = Math.min(255, e[i * 3 + 1] * 255);
      d[i * 4 + 2] = Math.min(255, e[i * 3 + 2] * 255);
      d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  normalCanvas(strength = 2) {
    const { w, h } = this;
    const hgt = this.height;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const at = (x, y) => hgt[((y + h) % h) * w + ((x + w) % w)];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
        const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
        let nx = -dx;
        let ny = dy;
        let nz = 1;
        const len = Math.hypot(nx, ny, nz);
        nx /= len;
        ny /= len;
        nz /= len;
        const i = (y * w + x) * 4;
        d[i] = (nx * 0.5 + 0.5) * 255;
        d[i + 1] = (ny * 0.5 + 0.5) * 255;
        d[i + 2] = (nz * 0.5 + 0.5) * 255;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
}

// ------------------------------------------------------------------ painters

const SOIL_STYLE = {
  topsoil: { pebbles: 14, roots: 2, specks: 10, clods: 7 },
  clay: { pebbles: 8, roots: 0, specks: 6, clods: 6, streaks: true },
  granite: { pebbles: 16, roots: 0, specks: 70, clods: 9 },
  magma: { pebbles: 10, roots: 0, specks: 25, clods: 8, embers: true },
  crystal: { pebbles: 9, roots: 0, specks: 50, clods: 7, glints: true }
};

export function paintSoil(biome, seed, size = 128) {
  const style = SOIL_STYLE[biome.key];
  const rng = new Rng(seed);
  const base = hexToRgb(biome.dirt);
  const dark = mixRgb(base, [0.05, 0.03, 0.02], 0.45);
  const light = mixRgb(base, [1, 0.95, 0.85], 0.18);
  const big = makeFbm(seed + 1, 3, 4, 0.55);
  const grain = makeFbm(seed + 2, 24, 2, 0.5);
  const cells = makeCells(seed + 3, style.clods);
  const s = new Surface(size);

  s.fill((u, v) => {
    const n = big(u, v);
    const g = grain(u, v);
    const c = cells(u, v);
    const edge = smoothstep(0.0, 0.06, c.f2 - c.f1);
    let col = mixRgb(dark, base, smoothstep(0.25, 0.7, n));
    col = mixRgb(col, light, Math.max(0, g - 0.55) * 1.2);
    col = mixRgb(col, mixRgb(col, [0, 0, 0], 0.16), 1 - edge);
    col = mixRgb(col, [col[0] * (0.85 + c.v * 0.3), col[1] * (0.85 + c.v * 0.3), col[2] * (0.85 + c.v * 0.3)], 0.6);
    if (style.streaks) {
      const streak = Math.sin((v * 9 + n * 2.5) * Math.PI * 2) * 0.5 + 0.5;
      col = mixRgb(col, mixRgb(base, [0.9, 0.5, 0.3], 0.25), smoothstep(0.8, 1, streak) * 0.35);
    }
    const height = n * 0.6 + g * 0.25 + edge * 0.12 + (1 - c.f1 * 4) * 0.1;
    return [col[0], col[1], col[2], height];
  });

  // Pebbles
  for (let i = 0; i < style.pebbles; i++) {
    const rx = rng.float(2.5, 6.5) * (size / 128);
    const tint = rng.float(0.75, 1.35);
    const pebble = mixRgb(base, [0.62, 0.58, 0.54], rng.float(0.35, 0.8)).map(v => v * tint);
    s.blob(rng.float(0, size), rng.float(0, size), rx, rx * rng.float(0.6, 1), pebble, 0.6);
  }

  // Roots near the surface
  for (let i = 0; i < style.roots; i++) {
    let x = rng.float(0, size);
    let y = rng.float(0, size);
    let angle = rng.float(0, Math.PI * 2);
    const rootCol = [0.22, 0.13, 0.07];
    for (let step = 0; step < 50; step++) {
      s.blob(x, y, 1.3, 1.3, rootCol, 0.25, 0.1, 0.8);
      angle += rng.float(-0.4, 0.4);
      x += Math.cos(angle) * 1.4;
      y += Math.sin(angle) * 1.4;
    }
  }

  // Mineral specks
  for (let i = 0; i < style.specks; i++) {
    const bright = style.glints ? [0.55, 0.95, 1.0] : rng.chance(0.5) ? [0.85, 0.85, 0.88] : [0.08, 0.08, 0.1];
    const r = rng.float(0.6, 1.4);
    s.blob(rng.float(0, size), rng.float(0, size), r, r, bright, 0.1, 0, 0.9);
  }
  if (style.embers) {
    for (let i = 0; i < 14; i++) {
      const r = rng.float(0.7, 1.6);
      s.blob(rng.float(0, size), rng.float(0, size), r, r, [0.85, 0.3, 0.08], 0, 0, 0.8);
    }
  }

  return s;
}

export function paintStone(seed, size = 128, tint = '#8C9097') {
  const rng = new Rng(seed);
  const base = hexToRgb(tint);
  const big = makeFbm(seed + 1, 4, 4, 0.55);
  const fine = makeFbm(seed + 2, 32, 2, 0.5);
  const cells = makeCells(seed + 3, 9);
  const s = new Surface(size);
  s.fill((u, v) => {
    const c = cells(u, v);
    const crevice = 1 - smoothstep(0.0, 0.035, c.f2 - c.f1);
    const n = big(u, v);
    const f = fine(u, v);
    let col = base.map(x => x * (0.72 + n * 0.45 + (c.v - 0.5) * 0.18));
    col = mixRgb(col, [0.95, 0.95, 0.97], Math.max(0, f - 0.62) * 1.3);
    col = mixRgb(col, [0.12, 0.12, 0.14], crevice * 0.85);
    const height = (1 - c.f1 * 3.2) * 0.5 + n * 0.35 + f * 0.15 - crevice * 0.6;
    return [col[0], col[1], col[2], height];
  });
  for (let i = 0; i < 40; i++) {
    const r = rng.float(0.5, 1.2);
    s.blob(rng.float(0, size), rng.float(0, size), r, r, [0.25, 0.25, 0.28], -0.1, 0, 0.8);
  }
  return s;
}

export function paintObsidian(seed, size = 128) {
  const big = makeFbm(seed + 1, 3, 4, 0.6);
  const cells = makeCells(seed + 2, 7);
  const s = new Surface(size);
  const base = hexToRgb('#160E22');
  const glint = hexToRgb('#6B3FA0');
  s.fill((u, v) => {
    const n = big(u, v);
    const c = cells(u, v);
    const facet = c.v;
    const streak = Math.pow(Math.max(0, Math.sin((u + v * 0.6 + n * 0.4) * Math.PI * 7)), 18);
    let col = base.map(x => x * (0.7 + facet * 0.7));
    col = mixRgb(col, glint, streak * 0.55 + smoothstep(0.03, 0, c.f2 - c.f1) * 0.25);
    const height = facet * 0.6 + (1 - c.f1 * 2.5) * 0.3;
    return [col[0], col[1], col[2], height];
  });
  return s;
}

export function paintBasalt(seed, size = 128) {
  const big = makeFbm(seed + 1, 4, 4, 0.55);
  const cells = makeCells(seed + 2, 11);
  const s = new Surface(size);
  s.emissive = new Float32Array(size * size * 3);
  const base = hexToRgb('#2E201E');
  s.fill((u, v, x, y) => {
    const n = big(u, v);
    const c = cells(u, v);
    const crack = 1 - smoothstep(0.0, 0.045, c.f2 - c.f1);
    const core = 1 - smoothstep(0.0, 0.016, c.f2 - c.f1);
    let col = base.map(x => x * (0.7 + n * 0.6 + c.v * 0.2));
    col = mixRgb(col, [0.45, 0.12, 0.04], crack * 0.8);
    const i = (y * size + x) * 3;
    const glow = crack * (0.55 + n * 0.45);
    s.emissive[i] = glow * 1.0 + core * 0.2;
    s.emissive[i + 1] = glow * 0.36 + core * 0.45;
    s.emissive[i + 2] = glow * 0.06 + core * 0.1;
    const height = n * 0.5 + (1 - c.f1 * 3) * 0.4 - crack * 0.7;
    return [col[0], col[1], col[2], height];
  });
  return s;
}

export function paintWood(seed, size = 128, tint = '#8E5B2E', planks = 4) {
  const rng = new Rng(seed);
  const base = hexToRgb(tint);
  const grain = makeFbm(seed + 1, 4, 3, 0.5);
  const s = new Surface(size);
  const offsets = Array.from({ length: planks }, () => rng.float(0, 1));
  const tints = Array.from({ length: planks }, () => rng.float(0.82, 1.12));
  s.fill((u, v) => {
    const p = Math.floor(u * planks);
    const pu = u * planks - p;
    const g = grain(u * 0.25 + offsets[p], v);
    const rings = Math.sin((v * 10 + g * 6 + offsets[p] * 20) * Math.PI) * 0.5 + 0.5;
    let col = base.map(x => x * tints[p] * (0.82 + rings * 0.22 + g * 0.15));
    const gap = smoothstep(0.06, 0.0, pu) + smoothstep(0.94, 1.0, pu);
    col = mixRgb(col, [0.12, 0.07, 0.03], gap * 0.85);
    const height = 0.6 + rings * 0.15 - gap * 0.6;
    return [col[0], col[1], col[2], height];
  });
  // nails
  for (let p = 0; p < planks; p++) {
    for (const y of [0.12, 0.88]) {
      s.blob((p + 0.5) * size / planks, y * size, 1.6, 1.6, [0.3, 0.3, 0.32], 0.4, 0.4);
    }
  }
  return s;
}

export function paintGrass(seed, size = 128) {
  const blades = makeFbm(seed + 1, 32, 2, 0.5);
  const big = makeFbm(seed + 2, 4, 3, 0.5);
  const s = new Surface(size);
  const dark = hexToRgb('#2F6B22');
  const light = hexToRgb('#7CC444');
  s.fill((u, v) => {
    const b = blades(u, v * 0.35);
    const n = big(u, v);
    let col = mixRgb(dark, light, smoothstep(0.3, 0.8, b * 0.6 + n * 0.5));
    return [col[0], col[1], col[2], b];
  });
  return s;
}

export function paintRock(biome, seed, size = 256) {
  const rng = new Rng(seed);
  const base = hexToRgb(biome.rock);
  const back = hexToRgb(biome.back);
  const warp = makeFbm(seed + 1, 2, 3, 0.5);
  const mid = makeFbm(seed + 2, 6, 3, 0.55);
  const fine = makeFbm(seed + 3, 32, 2, 0.5);
  const streak = makeFbm(seed + 4, 4, 2, 0.5);
  const layers = Array.from({ length: 6 }, () => rng.float(0.72, 1.22));
  const s = new Surface(size);
  s.fill((u, v) => {
    // sedimentary strata, gently warped
    const w = warp(u, v);
    const band = (v + w * 0.22) * layers.length;
    const li = ((Math.floor(band) % layers.length) + layers.length) % layers.length;
    const inBand = band - Math.floor(band);
    const seam = smoothstep(0.12, 0, inBand) + smoothstep(0.88, 1, inBand) * 0.6;
    const m = mid(u, v);
    const f = fine(u, v);
    const st = streak(u * 0.5, v * 6);
    let col = base.map(x => x * layers[li] * (0.72 + m * 0.42 + f * 0.14 + (st - 0.5) * 0.18));
    col = mixRgb(col, back, Math.min(1, seam) * 0.7);
    const height = m * 0.55 + f * 0.25 + st * 0.15 - seam * 0.55;
    return [col[0], col[1], col[2], height];
  });
  // embedded stones
  for (let i = 0; i < 26; i++) {
    const rx = rng.float(2, 7);
    const tint = rng.float(0.9, 1.45);
    s.blob(rng.float(0, size), rng.float(0, size), rx, rx * rng.float(0.5, 0.9), base.map(x => Math.min(1, x * tint)), 0.5, 0.35);
  }
  return s;
}

export function paintTnt(size = 128) {
  const s = new Surface(size);
  const red = hexToRgb('#C9302C');
  const sticks = 5;
  s.fill((u, v) => {
    const p = u * sticks;
    const t = p - Math.floor(p);
    const round = Math.sin(t * Math.PI);
    let col = red.map(x => x * (0.55 + round * 0.55));
    const stripe = smoothstep(0.02, 0, Math.abs(v - 0.16)) + smoothstep(0.02, 0, Math.abs(v - 0.84));
    col = mixRgb(col, [0.25, 0.08, 0.06], stripe * 0.6);
    return [col[0], col[1], col[2], round * 0.8];
  });
  const canvas = s.toCanvas();
  const ctx = canvas.getContext('2d');
  // paper band with the label
  const bandH = size * 0.36;
  const y = (size - bandH) / 2;
  const grad = ctx.createLinearGradient(0, y, 0, y + bandH);
  grad.addColorStop(0, '#F3E3BA');
  grad.addColorStop(1, '#D9C08A');
  ctx.fillStyle = grad;
  ctx.fillRect(0, y, size, bandH);
  ctx.fillStyle = 'rgba(90, 50, 20, 0.5)';
  ctx.fillRect(0, y, size, 2);
  ctx.fillRect(0, y + bandH - 2, size, 2);
  ctx.fillStyle = '#3B1E0E';
  ctx.font = `900 ${Math.round(size * 0.3)}px "Lilita One", Impact, "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TNT', size / 2, size / 2 + size * 0.01);
  return { canvas, surface: s };
}

export function paintCracks(stage, size = 128) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const rng = new Rng(77 + stage * 13);
  ctx.strokeStyle = 'rgba(15, 10, 8, 0.85)';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const count = stage === 1 ? 3 : 7;
  for (let i = 0; i < count; i++) {
    let x = size / 2 + rng.float(-10, 10);
    let y = size / 2 + rng.float(-10, 10);
    let angle = (i / count) * Math.PI * 2 + rng.float(-0.4, 0.4);
    ctx.lineWidth = stage === 1 ? 3 : 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const len = rng.int(4, 7);
    for (let j = 0; j < len; j++) {
      angle += rng.float(-0.6, 0.6);
      const step = rng.float(6, 12);
      x += Math.cos(angle) * step;
      y += Math.sin(angle) * step;
      ctx.lineTo(x, y);
      ctx.lineWidth *= 0.85;
    }
    ctx.stroke();
  }
  return canvas;
}

// Additive particles read the RGB falloff, alpha-blended ones read the alpha
export function paintSoftCircle(size = 64, alpha = false) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!alpha) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
  }
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  if (alpha) {
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.3, '#8C8C8C');
    g.addColorStop(1, '#000000');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

export function paintSky(height = 256) {
  const canvas = createCanvas(4, height);
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, '#3E7FD0');
  g.addColorStop(0.45, '#79B5EC');
  g.addColorStop(0.8, '#CFE6F7');
  g.addColorStop(1, '#F7E9CF');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, height);
  return canvas;
}

// ------------------------------------------------------------- GPU textures

export class TextureLibrary {
  constructor(device) {
    this.device = device;
    this.textures = {};
  }

  make(name, canvas, { srgb = true, mipmaps = true, repeat = true } = {}) {
    const tex = new pc.Texture(this.device, {
      name,
      width: canvas.width,
      height: canvas.height,
      format: pc.PIXELFORMAT_RGBA8,
      srgb,
      mipmaps,
      minFilter: mipmaps ? pc.FILTER_LINEAR_MIPMAP_LINEAR : pc.FILTER_LINEAR,
      magFilter: pc.FILTER_LINEAR,
      addressU: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
      addressV: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
      anisotropy: 4
    });
    tex.setSource(canvas);
    this.textures[name] = tex;
    return tex;
  }

  fromSurface(name, surface, normalStrength = 2.5) {
    this.make(name, surface.toCanvas());
    this.make(`${name}_n`, surface.normalCanvas(normalStrength), { srgb: false });
    if (surface.emissive) this.make(`${name}_e`, surface.emissiveCanvas());
  }

  get(name) {
    return this.textures[name];
  }

  // Generates everything. `onProgress` receives 0..1 so the loader can update.
  async generateAll(onProgress = () => {}) {
    const jobs = [];
    BIOMES.forEach((biome, i) => {
      jobs.push(() => this.fromSurface(`soil_${biome.key}`, paintSoil(biome, 100 + i * 17), 3));
      jobs.push(() => this.fromSurface(`rock_${biome.key}`, paintRock(biome, 300 + i * 23), 2.5));
    });
    jobs.push(() => this.fromSurface('stone', paintStone(11), 3));
    jobs.push(() => this.fromSurface('obsidian', paintObsidian(12), 2));
    jobs.push(() => this.fromSurface('basalt', paintBasalt(13), 3));
    jobs.push(() => this.fromSurface('wood', paintWood(14), 2));
    jobs.push(() => this.fromSurface('darkwood', paintWood(15, 128, '#5A3A20', 3), 2));
    jobs.push(() => this.fromSurface('grass', paintGrass(16), 1.5));
    jobs.push(() => {
      const tnt = paintTnt();
      this.make('tnt', tnt.canvas);
      this.make('tnt_n', tnt.surface.normalCanvas(1.5), { srgb: false });
    });
    jobs.push(() => {
      this.make('cracks1', paintCracks(1), { repeat: false });
      this.make('cracks2', paintCracks(2), { repeat: false });
      this.make('soft', paintSoftCircle(64, false), { repeat: false });
      this.make('softAlpha', paintSoftCircle(64, true), { repeat: false });
      this.make('sky', paintSky(), { repeat: false, mipmaps: false });
    });

    for (let i = 0; i < jobs.length; i++) {
      jobs[i]();
      onProgress((i + 1) / jobs.length);
      // yield so the loading screen can paint
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
}
