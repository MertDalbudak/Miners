/*
  Effect presets: particles, flashes and shakes for game events.
*/

import { B } from '../game/blocks.js';
import { BIOMES, biomeIndexAt } from '../game/biomes.js';
import { depthOfRow } from '../game/levelgen.js';
import { GEM_VARIANTS } from '../game/blocks.js';
import { hexColor } from './particles.js';
import { cellX, cellY } from './blocks-view.js';

const rand = (a, b) => a + Math.random() * (b - a);

const ORE_COLORS = {
  [B.COAL]: '#2A2724',
  [B.IRON]: '#D9A57E',
  [B.GOLD]: '#FFD24A',
  [B.DIAMOND]: '#7FEAFF',
  [B.TORCH]: '#FFB347',
  [B.PICKAXE]: '#C8CDD6',
  [B.SHIELD]: '#FFC23A',
  [B.FLARE]: '#FF5A3C',
  [B.CHEST]: '#FFD24A'
};

export function blockColor(type, r, variant = 0) {
  switch (type) {
    case B.STONE:
    case B.BOULDER:
      return hexColor('#8D8F95');
    case B.HARDSTONE:
      return hexColor('#7D8394');
    case B.OBSIDIAN:
      return hexColor('#2A1840');
    case B.MAGMA:
      return hexColor('#5A2A1E');
    case B.TNT:
      return hexColor('#C9302C');
    default:
      return hexColor(BIOMES[biomeIndexAt(depthOfRow(r))].dirt);
  }
}

export function sparkleColor(type, variant = 0) {
  if (type === B.GEM) return hexColor(GEM_VARIANTS[variant].color);
  return hexColor(ORE_COLORS[type] || '#FFFFFF');
}

export class Effects {
  constructor(particles) {
    this.p = particles;
  }

  // Chunks and dust when a block is dug out
  dig(c, r, type, variant = 0, strength = 1) {
    const x = cellX(c);
    const y = cellY(r);
    const color = blockColor(type, r, variant);
    const n = this.p.count(7 * strength);
    for (let i = 0; i < n; i++) {
      const shade = rand(0.65, 1.15);
      this.p.chunk({
        x: x + rand(-0.3, 0.3), y: y + rand(-0.3, 0.3), z: rand(0.2, 0.6),
        vx: rand(-2, 2), vy: rand(0.5, 3.2), vz: rand(0.5, 2.5),
        size: rand(0.06, 0.15), life: rand(0.6, 1.1), gravity: 11,
        color: color.map(v => v * shade), spin: rand(-12, 12), floor: y - 0.48
      });
    }
    const dust = this.p.count(5 * strength);
    for (let i = 0; i < dust; i++) {
      this.p.puff({
        x: x + rand(-0.3, 0.3), y: y + rand(-0.3, 0.2), z: 0.55,
        vx: rand(-0.4, 0.4), vy: rand(0, 0.5), size: rand(0.18, 0.3), size1: rand(0.45, 0.7),
        life: rand(0.6, 1.0), drag: 2, color: color.map(v => Math.min(1, v * 1.25)), alpha: 0.55, fadePow: 1.5
      });
    }
  }

  collect(c, r, type, variant = 0) {
    const x = cellX(c);
    const y = cellY(r);
    const color = sparkleColor(type, variant);
    const n = this.p.count(type === B.GEM || type === B.DIAMOND ? 26 : 14);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(1, 3.2);
      this.p.spark({
        x, y, z: 0.7, vx: Math.cos(a) * s, vy: Math.sin(a) * s + 0.6,
        size: rand(0.05, 0.11), size1: 0.01, life: rand(0.4, 0.8), drag: 3, gravity: 1.5,
        color: color.map(v => Math.min(1, v + 0.3)), color1: color, alpha: 1.6
      });
    }
    this.p.spark({ x, y, z: 0.75, size: 0.3, size1: 1.1, life: 0.3, color, alpha: 1.2, fadePow: 1 });
  }

  sparks(c, r, dirX = 0, count = 12, color = '#FFD27A') {
    const x = cellX(c) - dirX * 0.45;
    const y = cellY(r);
    const col = hexColor(color);
    const n = this.p.count(count);
    for (let i = 0; i < n; i++) {
      this.p.spark({
        x: x + rand(-0.1, 0.1), y: y + rand(-0.2, 0.2), z: 0.7,
        vx: -dirX * rand(1, 3.5) + rand(-1.5, 1.5), vy: rand(0.5, 3), vz: rand(0, 1),
        size: rand(0.03, 0.06), size1: 0.005, life: rand(0.25, 0.5), gravity: 9, color: col, alpha: 2
      });
    }
  }

  land(x, y, r, strength = 1) {
    const color = blockColor(B.DIRT, r + 1);
    const n = this.p.count(6 * strength);
    for (let i = 0; i < n; i++) {
      const s = i % 2 ? 1 : -1;
      this.p.puff({
        x: x + s * rand(0.05, 0.3), y: y - 0.42, z: 0.5,
        vx: s * rand(0.6, 1.6), vy: rand(0.1, 0.5), size: rand(0.12, 0.2), size1: rand(0.35, 0.5),
        life: rand(0.4, 0.7), drag: 4, color: color.map(v => Math.min(1, v * 1.3)), alpha: 0.5
      });
    }
  }

  explosion(c, r) {
    const x = cellX(c);
    const y = cellY(r);
    const fire = hexColor('#FFB347');
    const hot = hexColor('#FFF3C4');
    const smoke = hexColor('#3A3330');
    this.p.spark({ x, y, z: 0.9, size: 0.6, size1: 3.4, life: 0.35, color: hot, color1: fire, alpha: 2.2, fadePow: 1 });
    const n = this.p.count(46);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(1.5, 6);
      this.p.spark({
        x: x + rand(-0.2, 0.2), y: y + rand(-0.2, 0.2), z: 0.8,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s + 1, vz: rand(-1, 2),
        size: rand(0.12, 0.32), size1: 0.02, life: rand(0.35, 0.8), drag: 3.5, gravity: -1,
        color: hot, color1: hexColor('#FF5A1F'), alpha: 1.8, fadePow: 1.2
      });
    }
    const m = this.p.count(18);
    for (let i = 0; i < m; i++) {
      this.p.puff({
        x: x + rand(-0.6, 0.6), y: y + rand(-0.6, 0.6), z: 0.8,
        vx: rand(-1, 1), vy: rand(0.4, 1.8), size: rand(0.3, 0.5), size1: rand(1.1, 1.7),
        life: rand(1.2, 2.2), drag: 1.5, color: smoke, alpha: 0.75, fadePow: 1.4, fadeIn: 0.15
      });
    }
    const k = this.p.count(16);
    for (let i = 0; i < k; i++) {
      this.p.chunk({
        x: x + rand(-0.4, 0.4), y: y + rand(-0.4, 0.4), z: rand(0.3, 0.8),
        vx: rand(-5, 5), vy: rand(1, 6), vz: rand(0.5, 3),
        size: rand(0.07, 0.17), life: rand(0.8, 1.4), gravity: 12, spin: rand(-15, 15),
        color: blockColor(B.DIRT, r).map(v => v * rand(0.4, 0.9))
      });
    }
    for (let i = 0; i < this.p.count(14); i++) {
      this.p.spark({
        x, y, z: 0.8, vx: rand(-4, 4), vy: rand(2, 7), size: 0.04, size1: 0.01,
        life: rand(0.8, 1.6), gravity: 6, color: hexColor('#FFD27A'), alpha: 2
      });
    }
  }

  flareLaunch(x, y) {
    for (let i = 0; i < this.p.count(30); i++) {
      this.p.spark({
        x: x + rand(-0.05, 0.05), y, z: 0.9, vx: rand(-0.4, 0.4), vy: rand(3, 9),
        size: rand(0.06, 0.14), size1: 0.01, life: rand(0.5, 1.1), drag: 1.5,
        color: hexColor('#FFE7A8'), color1: hexColor('#FF4A2A'), alpha: 2
      });
    }
  }

  shieldBreak(x, y) {
    const yellow = hexColor('#FFC23A');
    for (let i = 0; i < this.p.count(12); i++) {
      this.p.chunk({
        x, y: y + 0.35, z: 0.6, vx: rand(-3, 3), vy: rand(1, 4), vz: rand(0, 2),
        size: rand(0.05, 0.1), life: rand(0.6, 1), gravity: 10, spin: rand(-20, 20), color: yellow
      });
    }
    this.p.spark({ x, y, z: 0.9, size: 0.4, size1: 1.8, life: 0.35, color: hexColor('#FFF4C2'), alpha: 1.5, fadePow: 1 });
  }

  goo(c, r, color = '#8A1F32') {
    const x = cellX(c);
    const y = cellY(r);
    const col = hexColor(color);
    for (let i = 0; i < this.p.count(14); i++) {
      this.p.chunk({
        x, y, z: 0.5, vx: rand(-2.5, 2.5), vy: rand(0.5, 3.5), vz: rand(0, 2),
        size: rand(0.06, 0.13), life: rand(0.6, 1), gravity: 10, spin: rand(-8, 8), color: col
      });
    }
    for (let i = 0; i < this.p.count(6); i++) {
      this.p.puff({ x, y, z: 0.6, vx: rand(-0.5, 0.5), vy: rand(0.2, 0.8), size: 0.2, size1: 0.6, life: 0.8, color: col, alpha: 0.5 });
    }
  }

  coins(c, r) {
    const x = cellX(c);
    const y = cellY(r);
    const gold = hexColor('#FFD24A');
    for (let i = 0; i < this.p.count(14); i++) {
      this.p.chunk({
        x, y, z: 0.7, vx: rand(-2, 2), vy: rand(2, 5), vz: rand(0.5, 2),
        size: rand(0.06, 0.09), life: rand(0.7, 1.1), gravity: 11, spin: rand(-20, 20), color: gold
      });
    }
  }

  glint(x, y, color) {
    this.p.spark({
      x: x + rand(-0.3, 0.3), y: y + rand(-0.3, 0.3), z: 0.75,
      size: 0.02, size1: rand(0.1, 0.16), life: rand(0.35, 0.6), color, alpha: 1.6, fadePow: 3, rot: Math.PI / 4
    });
  }

  trickle(c, r) {
    const color = blockColor(B.DIRT, r);
    this.p.chunk({
      x: cellX(c) + rand(-0.3, 0.3), y: cellY(r) - 0.45, z: rand(0.1, 0.5),
      vx: rand(-0.2, 0.2), vy: -0.3, size: rand(0.03, 0.06), life: 0.6, gravity: 9, color
    });
  }

  // Ambient particles drifting around the view, depending on the layer
  ambient(kind, x, y) {
    switch (kind) {
      case 'dust':
        this.p.puff({
          x: x + rand(-1.6, 1.6), y: y + rand(-1.2, 1.2), z: rand(0.6, 1.4),
          vx: rand(-0.08, 0.08), vy: rand(-0.06, 0.06), size: rand(0.015, 0.03),
          life: rand(2.5, 4), color: [1, 0.92, 0.75], alpha: 0.9, fadeIn: 0.8, fadePow: 1
        });
        break;
      case 'ember':
        this.p.spark({
          x: x + rand(-6, 6), y: y - rand(4, 7), z: rand(0.7, 1.5),
          vx: rand(-0.2, 0.2), vy: rand(0.6, 1.4), size: rand(0.02, 0.045), life: rand(2.5, 4.5),
          color: hexColor('#FF8A3C'), color1: hexColor('#FF3A1A'), alpha: 1.6, fadeIn: 0.3, fadePow: 1.5
        });
        break;
      case 'spark':
        this.p.spark({
          x: x + rand(-6, 6), y: y + rand(-6, 6), z: rand(0.7, 1.6),
          vx: rand(-0.1, 0.1), vy: rand(0.05, 0.25), size: rand(0.02, 0.04), life: rand(2, 3.5),
          color: hexColor(Math.random() < 0.5 ? '#7DF0FF' : '#C79BFF'), alpha: 1.4, fadeIn: 0.6, fadePow: 1
        });
        break;
      case 'drip':
        this.p.spark({
          x: x + rand(-5, 5), y: y + rand(2, 6), z: rand(0.6, 1.2),
          vy: -0.5, gravity: 6, size: 0.022, life: rand(1, 1.6),
          color: hexColor('#9FD3FF'), alpha: 0.9, fadePow: 4
        });
        break;
    }
  }
}
