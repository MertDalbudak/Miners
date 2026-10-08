/*
  Small 2D pictures of blocks and creatures for menus and the results screen.
*/

import { B, GEM_VARIANTS } from '../game/blocks.js';

const cache = new Map();

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function block(ctx, s, light, dark) {
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  roundRect(ctx, s * 0.06, s * 0.06, s * 0.88, s * 0.88, s * 0.14);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = s * 0.04;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.stroke();
  // bevel highlight
  roundRect(ctx, s * 0.1, s * 0.1, s * 0.8, s * 0.8, s * 0.11);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = s * 0.03;
  ctx.stroke();
}

function speckle(ctx, s, color, count, seed) {
  let x = seed * 9301 + 49297;
  const rnd = () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.beginPath();
    ctx.arc(s * (0.15 + rnd() * 0.7), s * (0.15 + rnd() * 0.7), s * (0.015 + rnd() * 0.02), 0, Math.PI * 2);
    ctx.fill();
  }
}

function lumps(ctx, s, color, shine, points) {
  for (const [px, py, r] of points) {
    const g = ctx.createRadialGradient(s * (px - r * 0.35), s * (py - r * 0.35), s * r * 0.1, s * px, s * py, s * r);
    g.addColorStop(0, shine);
    g.addColorStop(0.45, color);
    g.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s * px, s * py, s * r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function crystal(ctx, s, color, cx, cy, w, h, angle = 0) {
  ctx.save();
  ctx.translate(s * cx, s * cy);
  ctx.rotate(angle);
  const pts = [[0, -h], [w * 0.55, -h * 0.55], [w * 0.5, h * 0.5], [0, h * 0.62], [-w * 0.5, h * 0.5], [-w * 0.55, -h * 0.55]];
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
  ctx.closePath();
  const g = ctx.createLinearGradient(-w * s, -h * s, w * s, h * s);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(0.35, color);
  g.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = s * 0.018;
  ctx.beginPath();
  ctx.moveTo(0, -h * s);
  ctx.lineTo(0, h * 0.62 * s);
  ctx.moveTo(-w * 0.55 * s, -h * 0.55 * s);
  ctx.lineTo(w * 0.5 * s, h * 0.5 * s);
  ctx.stroke();
  ctx.restore();
}

const SOIL = ['#9A6A3E', '#5E3C20'];
const STONE = ['#A3A7AE', '#5D6168'];

const painters = {
  [B.DIRT]: (ctx, s) => {
    block(ctx, s, ...SOIL);
    speckle(ctx, s, 'rgba(255,230,190,0.35)', 10, 3);
  },
  [B.COAL]: (ctx, s) => {
    block(ctx, s, ...SOIL);
    lumps(ctx, s, '#2B2826', '#7D7873', [[0.35, 0.36, 0.14], [0.64, 0.42, 0.12], [0.45, 0.66, 0.13]]);
  },
  [B.IRON]: (ctx, s) => {
    block(ctx, s, '#8A6A50', '#4A3220');
    lumps(ctx, s, '#F0C9A8', '#FFFFFF', [[0.33, 0.35, 0.1], [0.62, 0.32, 0.09], [0.66, 0.62, 0.1], [0.38, 0.66, 0.09]]);
  },
  [B.GOLD]: (ctx, s) => {
    block(ctx, s, ...SOIL);
    lumps(ctx, s, '#FFC83A', '#FFF6C8', [[0.34, 0.34, 0.1], [0.63, 0.38, 0.11], [0.45, 0.66, 0.11], [0.7, 0.68, 0.07]]);
  },
  [B.DIAMOND]: (ctx, s) => {
    block(ctx, s, ...STONE);
    crystal(ctx, s, '#7FEAFF', 0.38, 0.52, 0.16, 0.3, -0.35);
    crystal(ctx, s, '#7FEAFF', 0.64, 0.5, 0.13, 0.24, 0.35);
  },
  [B.STONE]: (ctx, s) => {
    block(ctx, s, ...STONE);
    ctx.strokeStyle = 'rgba(30,30,35,0.55)';
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    ctx.moveTo(s * 0.2, s * 0.45);
    ctx.lineTo(s * 0.45, s * 0.4);
    ctx.lineTo(s * 0.55, s * 0.7);
    ctx.moveTo(s * 0.45, s * 0.4);
    ctx.lineTo(s * 0.75, s * 0.3);
    ctx.stroke();
  },
  [B.HARDSTONE]: (ctx, s) => {
    block(ctx, s, '#8F96A8', '#4B505E');
    ctx.fillStyle = '#6F5847';
    ctx.fillRect(s * 0.06, s * 0.24, s * 0.88, s * 0.08);
    ctx.fillRect(s * 0.06, s * 0.68, s * 0.88, s * 0.08);
    ctx.fillStyle = '#B9A48F';
    for (const x of [0.2, 0.5, 0.8]) {
      for (const y of [0.28, 0.72]) {
        ctx.beginPath();
        ctx.arc(s * x, s * y, s * 0.025, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },
  [B.OBSIDIAN]: (ctx, s) => {
    block(ctx, s, '#3B2560', '#0E0818');
    ctx.strokeStyle = 'rgba(190,150,255,0.5)';
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    ctx.moveTo(s * 0.2, s * 0.3);
    ctx.lineTo(s * 0.4, s * 0.18);
    ctx.moveTo(s * 0.6, s * 0.8);
    ctx.lineTo(s * 0.82, s * 0.62);
    ctx.stroke();
  },
  [B.MAGMA]: (ctx, s) => {
    block(ctx, s, '#4A302C', '#1E1210');
    ctx.strokeStyle = '#FF7A2E';
    ctx.shadowColor = '#FF5A1F';
    ctx.shadowBlur = s * 0.12;
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    ctx.moveTo(s * 0.18, s * 0.35);
    ctx.lineTo(s * 0.42, s * 0.48);
    ctx.lineTo(s * 0.38, s * 0.8);
    ctx.moveTo(s * 0.42, s * 0.48);
    ctx.lineTo(s * 0.8, s * 0.4);
    ctx.stroke();
    ctx.shadowBlur = 0;
  },
  [B.TNT]: (ctx, s) => {
    block(ctx, s, '#E0473F', '#8E1E1A');
    ctx.fillStyle = '#F1DDAF';
    ctx.fillRect(s * 0.06, s * 0.36, s * 0.88, s * 0.28);
    ctx.fillStyle = '#3B1E0E';
    ctx.font = `${Math.round(s * 0.24)}px "Lilita One", Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TNT', s / 2, s * 0.51);
  },
  [B.BOULDER]: (ctx, s) => {
    lumps(ctx, s, '#A08C78', '#E8DCCD', [[0.5, 0.52, 0.38]]);
  },
  [B.TORCH]: (ctx, s) => {
    block(ctx, s, ...SOIL);
    // glow
    const glow = ctx.createRadialGradient(s * 0.5, s * 0.38, 0, s * 0.5, s * 0.38, s * 0.3);
    glow.addColorStop(0, 'rgba(255, 190, 80, 0.6)');
    glow.addColorStop(1, 'rgba(255, 110, 30, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, s, s);
    // handle and wrapped head
    ctx.fillStyle = '#A8743D';
    ctx.fillRect(s * 0.46, s * 0.5, s * 0.08, s * 0.3);
    ctx.fillStyle = '#5A3A22';
    ctx.fillRect(s * 0.42, s * 0.45, s * 0.16, s * 0.09);
    // flame
    const tear = (w, h, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * (0.46 - h));
      ctx.bezierCurveTo(s * (0.5 + w), s * (0.46 - h * 0.45), s * (0.5 + w), s * 0.46, s * 0.5, s * 0.46);
      ctx.bezierCurveTo(s * (0.5 - w), s * 0.46, s * (0.5 - w), s * (0.46 - h * 0.45), s * 0.5, s * (0.46 - h));
      ctx.fill();
    };
    tear(0.13, 0.3, '#FF8A2A');
    tear(0.07, 0.18, '#FFF0B0');
  },
  [B.PICKAXE]: (ctx, s) => {
    block(ctx, s, ...SOIL);
    ctx.save();
    ctx.translate(s * 0.5, s * 0.52);
    ctx.rotate(0.6);
    ctx.fillStyle = '#A8743D';
    ctx.fillRect(-s * 0.035, -s * 0.2, s * 0.07, s * 0.46);
    ctx.fillStyle = '#C8CDD6';
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, -s * 0.12);
    ctx.quadraticCurveTo(0, -s * 0.34, s * 0.3, -s * 0.12);
    ctx.lineTo(s * 0.26, -s * 0.18);
    ctx.quadraticCurveTo(0, -s * 0.26, -s * 0.26, -s * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },
  [B.SHIELD]: (ctx, s) => {
    block(ctx, s, ...SOIL);
    ctx.fillStyle = '#FFB82E';
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.58, s * 0.26, s * 0.24, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(s * 0.18, s * 0.56, s * 0.64, s * 0.07);
    ctx.fillStyle = '#FFF4D6';
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.46, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
  },
  [B.FLARE]: (ctx, s) => {
    block(ctx, s, ...SOIL);
    ctx.save();
    ctx.translate(s * 0.5, s * 0.5);
    ctx.rotate(-0.5);
    ctx.fillStyle = '#E23B2E';
    ctx.fillRect(-s * 0.06, -s * 0.22, s * 0.12, s * 0.44);
    ctx.fillStyle = '#F2EFE8';
    ctx.fillRect(-s * 0.065, -s * 0.28, s * 0.13, s * 0.09);
    ctx.restore();
  },
  [B.CHEST]: (ctx, s) => {
    block(ctx, s, ...SOIL);
    ctx.fillStyle = '#8E5B2E';
    roundRect(ctx, s * 0.22, s * 0.36, s * 0.56, s * 0.38, s * 0.06);
    ctx.fill();
    ctx.fillStyle = '#E8B23A';
    ctx.fillRect(s * 0.22, s * 0.48, s * 0.56, s * 0.05);
    ctx.fillRect(s * 0.46, s * 0.46, s * 0.08, s * 0.12);
  }
};

function gemPainter(variant) {
  return (ctx, s) => {
    block(ctx, s, ...STONE);
    crystal(ctx, s, GEM_VARIANTS[variant].color, 0.5, 0.52, 0.24, 0.34, 0);
  };
}

export function blockIcon(type, variant = 0, size = 64) {
  const key = `${type}:${variant}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const paint = type === B.GEM ? gemPainter(variant) : painters[type];
  if (paint) paint(ctx, size);
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

export function monsterIcon(kind = 'crawler', size = 64) {
  const key = `monster:${kind}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const s = size;
  if (kind === 'burrower') {
    lumps(ctx, s, '#5E5577', '#B9B0D6', [[0.46, 0.55, 0.32]]);
    ctx.fillStyle = '#A7ADB8';
    ctx.beginPath();
    ctx.moveTo(s * 0.74, s * 0.42);
    ctx.lineTo(s * 0.98, s * 0.55);
    ctx.lineTo(s * 0.74, s * 0.68);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#55FF7A';
  } else {
    ctx.fillStyle = '#43101A';
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (1.1 + i * 0.13);
      ctx.beginPath();
      ctx.moveTo(s * (0.5 + Math.cos(a) * 0.22), s * (0.55 + Math.sin(a) * 0.22));
      ctx.lineTo(s * (0.5 + Math.cos(a + 0.12) * 0.42), s * (0.55 + Math.sin(a + 0.12) * 0.42));
      ctx.lineTo(s * (0.5 + Math.cos(a + 0.24) * 0.22), s * (0.55 + Math.sin(a + 0.24) * 0.22));
      ctx.fill();
    }
    lumps(ctx, s, '#8A1F32', '#E0707F', [[0.5, 0.56, 0.3]]);
    ctx.fillStyle = '#1A0508';
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.68, s * 0.14, s * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFE36B';
  }
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = s * 0.12;
  for (const dx of [-0.1, 0.1]) {
    ctx.beginPath();
    ctx.arc(s * (0.5 + dx), s * 0.5, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}
