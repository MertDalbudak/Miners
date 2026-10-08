/*
  The surface: a little mining camp above the shaft with a headframe, a mine
  cart, a shack, forest, mountains and sky.
*/

import * as pc from 'playcanvas';
import { Rng } from '../core/rng.js';
import { GameConfig } from '../config.js';
import { geo, append, trs, prim, toMesh, rock, lowCone, flatten } from './geometry.js';
import { quad, boxUV } from './models.js';
import { Mask } from './masks.js';
import { createCanvas } from './textures.js';

const HALF = GameConfig.COLS / 2;
const WALL_FRONT = 0.62;

function paintSign(width = 512, height = 160) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, '#8B5A2B');
  g.addColorStop(1, '#5E3A1A');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(40, 20, 8, 0.6)';
  ctx.lineWidth = 3;
  for (let y = 40; y < height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.strokeStyle = '#3A2210';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, width - 14, height - 14);
  ctx.font = `${Math.round(height * 0.62)}px "Lilita One", Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#3A1D0A';
  ctx.strokeText('MINERS', width / 2, height / 2 + 6);
  ctx.fillStyle = '#FFCE4B';
  ctx.fillText('MINERS', width / 2, height / 2 + 6);
  return canvas;
}

export class Surface {
  constructor(app, materials, textures) {
    this.app = app;
    this.device = app.graphicsDevice;
    this.materials = materials;
    this.textures = textures;
    this.root = new pc.Entity('surface');
    app.root.addChild(this.root);
    this.parts = new Map();
    this.clouds = [];
    this.build();
  }

  geo(material) {
    if (!this.parts.has(material)) this.parts.set(material, geo());
    return this.parts.get(material);
  }

  addEntity(name, g, material, mask = Mask.SURFACE, parent = this.root) {
    const e = new pc.Entity(name);
    const mi = new pc.MeshInstance(toMesh(this.device, g), material instanceof pc.Material ? material : this.materials.get(material), e);
    mi.mask = mask;
    e.addComponent('render', { meshInstances: [mi] });
    mi.mask = mask;
    parent.addChild(e);
    return e;
  }

  build() {
    const rng = new Rng(2015);

    // Ground: behind the shaft and on both sides of it
    const ground = this.geo('grass');
    const up = [0, 1, 0];
    const groundQuad = (x0, z0, x1, z1) => {
      const g = geo();
      g.positions.push(x0, 0, z1, x1, 0, z1, x1, 0, z0, x0, 0, z0);
      for (let i = 0; i < 4; i++) g.normals.push(...up);
      const s = 0.35;
      g.uvs.push(x0 * s, z1 * s, x1 * s, z1 * s, x1 * s, z0 * s, x0 * s, z0 * s);
      g.indices.push(0, 1, 2, 0, 2, 3);
      append(ground, g);
    };
    groundQuad(-160, -220, 160, -0.5);
    groundQuad(-160, -0.5, -HALF, WALL_FRONT);
    groundQuad(HALF, -0.5, 160, WALL_FRONT);

    // Grass lip over the cut-away earth
    const lip = this.geo('leaves');
    append(lip, prim.box(80, 0.07, 0.06), trs(-HALF - 80, -0.04, WALL_FRONT + 0.03));
    append(lip, prim.box(80, 0.07, 0.06), trs(HALF + 80, -0.04, WALL_FRONT + 0.03));
    const tufts = geo();
    for (let i = 0; i < 160; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (HALF + 0.2 + rng.float(0, 30));
      append(tufts, prim.cone(0.05, 0, rng.float(0.12, 0.28), 4), trs(x, 0, rng.float(-0.6, WALL_FRONT), rng.float(-15, 15), 0, rng.float(-20, 20)));
    }
    append(this.geo('leaves'), flatten(tufts));

    this.buildHeadframe();
    this.buildCart();
    this.buildShack();
    this.buildTrees(rng);
    this.buildMountains(rng);
    this.buildSky();

    for (const [material, g] of this.parts) {
      if (g.positions.length) this.addEntity(`surface_${material}`, g, material);
    }
  }

  buildHeadframe() {
    const wood = this.geo('darkwood');
    const z = -1.6;
    // A-frame legs straddling the shaft
    const base = GameConfig.COLS * 0.4;
    const top = 1.15;
    const legX = y => base + (top - base) * (y / 6.2);
    for (const s of [-1, 1]) {
      const x0 = s * base;
      const x1 = s * top;
      const len = Math.hypot(x1 - x0, 6.2);
      const ang = (Math.atan2(x1 - x0, 6.2) * 180) / Math.PI;
      for (const dz of [-0.6, 0.6]) {
        append(wood, boxUV(0.13, len / 2, 0.13, 1), trs((x0 + x1) / 2, 3.1, z + dz, 0, 0, -ang));
      }
      // cross braces
      append(wood, boxUV(0.07, 0.07, 0.7, 1), trs(s * legX(2.0), 2.0, z));
      append(wood, boxUV(0.07, 0.07, 0.7, 1), trs(s * legX(4.0), 4.0, z));
    }
    append(wood, boxUV(legX(1.6) - 0.06, 0.08, 0.08, 1), trs(0, 1.6, z + 0.6));
    append(wood, boxUV(legX(3.4) - 0.06, 0.08, 0.08, 1), trs(0, 3.4, z + 0.6));
    // Top platform
    append(wood, boxUV(1.5, 0.1, 0.8, 1), trs(0, 6.25, z));
    // Back stay
    const stayLen = Math.hypot(5, 6);
    append(wood, boxUV(0.12, stayLen / 2, 0.12, 1), trs(0, 3.1, z - 2.5, -Math.atan2(5, 6) * 180 / Math.PI, 0, 0));

    // Sheave wheel
    const metal = this.geo('darkmetal');
    const wheelT = trs(0, 6.95, z, 90, 0, 0);
    append(metal, prim.torus(0.06, 0.62, 28, 8), wheelT);
    for (let i = 0; i < 6; i++) {
      append(metal, prim.cylinder(0.025, 1.2, 6), trs(0, 6.95, z, 0, 0, i * 30));
    }
    append(metal, prim.cylinder(0.12, 0.3, 10), trs(0, 6.95, z, 90, 0, 0));
    // Cable down into the shaft with a hook
    append(metal, prim.cylinder(0.018, 4.9, 6), trs(0.62, 4.45, z + 0.1));
    append(metal, prim.cylinder(0.018, 2.6, 6), trs(0.62, 2.2, z + 0.6, 30, 0, 0));
    append(metal, prim.torus(0.03, 0.12, 12, 6, 270), trs(0.62, 0.95, -0.3, 90, 0, 0));

    // Sign board
    const signTex = this.textures.make('sign', paintSign(), { repeat: false });
    const signMat = new pc.StandardMaterial();
    signMat.diffuseMap = signTex;
    signMat.gloss = 0.2;
    signMat.useSkybox = false;
    signMat.update();
    const sign = geo();
    sign.positions.push(-1.5, -0.47, 0, 1.5, -0.47, 0, 1.5, 0.47, 0, -1.5, 0.47, 0);
    sign.normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
    sign.uvs.push(0, 1, 1, 1, 1, 0, 0, 0);
    sign.indices.push(0, 1, 2, 0, 2, 3);
    const signEntity = this.addEntity('sign', sign, signMat);
    signEntity.setPosition(0, 4.75, z + 0.68);
    append(wood, boxUV(1.58, 0.53, 0.04, 1), trs(0, 4.75, z + 0.63));
  }

  buildCart() {
    const metal = this.geo('metal');
    const sleepers = this.geo('darkwood');
    const z = -1.1;
    for (const dz of [-0.32, 0.32]) {
      append(metal, prim.box(6, 0.03, 0.035), trs(13, 0.08, z + dz));
    }
    for (let x = 7.4; x < 19; x += 0.8) {
      append(sleepers, boxUV(0.12, 0.04, 0.5, 1), trs(x, 0.03, z));
    }
    const cart = this.geo('rust');
    const cx = 9.6;
    append(cart, prim.box(0.75, 0.32, 0.45), trs(cx, 0.62, z));
    append(cart, prim.box(0.8, 0.05, 0.5), trs(cx, 0.96, z));
    const wheels = this.geo('darkmetal');
    for (const wx of [-0.45, 0.45]) {
      for (const dz of [-0.36, 0.36]) {
        append(wheels, prim.cylinder(0.17, 0.06, 12), trs(cx + wx, 0.2, z + dz, 90, 0, 0));
      }
    }
    const gold = this.geo('gold');
    const rng = new Rng(3);
    for (let i = 0; i < 9; i++) {
      append(gold, rock(rng.int(1, 999), rng.float(0.1, 0.17), 1, 0.2), trs(cx + rng.float(-0.5, 0.5), 0.98 + rng.float(0, 0.08), z + rng.float(-0.25, 0.25)));
    }
  }

  buildShack() {
    const wood = this.geo('wood');
    const x = -10.5;
    const z = -4;
    append(wood, boxUV(1.7, 1.1, 1.4, 0.5), trs(x, 1.1, z));
    const roof = this.geo('roof');
    append(roof, boxUV(1.95, 0.08, 1.05, 0.5), trs(x, 2.55, z + 0.62, -37, 0, 0));
    append(roof, boxUV(1.95, 0.08, 1.05, 0.5), trs(x, 2.55, z - 0.62, 37, 0, 0));
    append(this.geo('darkwood'), boxUV(0.42, 0.75, 0.03, 1), trs(x + 0.6, 0.75, z + 1.41));
    append(this.geo('lanternGlass'), prim.box(0.32, 0.27, 0.02), trs(x - 0.75, 1.35, z + 1.41));
    append(this.geo('darkwood'), boxUV(0.38, 0.32, 0.02, 1), trs(x - 0.75, 1.35, z + 1.4));
    // gable ends
    const gable = this.geo('wood');
    for (const s of [-1, 1]) {
      const g = geo();
      g.positions.push(-1.4, 0, 0, 1.4, 0, 0, 0, 1.05, 0);
      g.normals.push(s, 0, 0, s, 0, 0, s, 0, 0);
      g.uvs.push(0, 1, 1.4, 1, 0.7, 0.4);
      g.indices.push(...(s > 0 ? [0, 1, 2] : [0, 2, 1]));
      append(gable, g, trs(x + s * 1.7, 2.2, z, 0, 90, 0));
    }
    // barrels and crates
    const barrels = this.geo('plainwood');
    append(barrels, prim.cylinder(0.3, 0.75, 12), trs(x + 2.4, 0.38, z + 1.2));
    append(barrels, prim.cylinder(0.3, 0.75, 12), trs(x + 3.05, 0.38, z + 0.9));
    const crates = this.geo('wood');
    append(crates, boxUV(0.35, 0.35, 0.35, 1), trs(x - 2.4, 0.35, z + 1.3, 0, 20, 0));
    append(crates, boxUV(0.28, 0.28, 0.28, 1), trs(x - 2.35, 0.98, z + 1.25, 0, -10, 0));
    const hoops = this.geo('darkmetal');
    for (const bx of [x + 2.4, x + 3.05]) {
      const bz = bx === x + 2.4 ? z + 1.2 : z + 0.9;
      append(hoops, prim.torus(0.02, 0.305, 16, 4), trs(bx, 0.15, bz));
      append(hoops, prim.torus(0.02, 0.305, 16, 4), trs(bx, 0.6, bz));
    }
    // lamp post by the shaft
    append(this.geo('darkwood'), boxUV(0.06, 1.1, 0.06, 1), trs(-6.6, 1.1, -0.4));
    append(this.geo('darkwood'), boxUV(0.3, 0.04, 0.04, 1), trs(-6.4, 2.15, -0.4));
    append(this.geo('lanternGlass'), prim.cylinder(0.1, 0.26, 8), trs(-6.15, 1.9, -0.4));
  }

  buildTrees(rng) {
    const trunk = this.geo('trunk');
    let placed = 0;
    for (let i = 0; i < 400 && placed < 70; i++) {
      const x = rng.float(-60, 60);
      const z = -rng.float(5, 70);
      if (Math.abs(x) < 8 && z > -12) continue;
      if (x < -7 && x > -14.5 && z > -7.5) continue;
      if (x > 5.5 && x < 19.5 && z > -3) continue;
      placed++;
      const scale = rng.float(0.8, 1.5) * (1 + -z / 60);
      if (rng.chance(0.45)) {
        append(trunk, prim.cylinder(0.12 * scale, 1.2 * scale, 6), trs(x, 0.6 * scale, z));
        const leaves = this.geo(rng.chance(0.5) ? 'leaves' : 'leaves2');
        for (let k = 0; k < 3; k++) {
          append(leaves, rock(rng.int(1, 1e6), (0.75 - k * 0.12) * scale, 1, 0.12),
            trs(x + rng.float(-0.3, 0.3) * scale, (1.5 + k * 0.55) * scale, z + rng.float(-0.3, 0.3) * scale));
        }
      } else {
        append(trunk, prim.cylinder(0.1 * scale, 0.8 * scale, 6), trs(x, 0.4 * scale, z));
        const pine = this.geo('pine');
        for (let k = 0; k < 3; k++) {
          append(pine, lowCone((0.95 - k * 0.24) * scale, 1.2 * scale, 7, rng.int(1, 1e6)), trs(x, (0.6 + k * 0.6) * scale, z));
        }
      }
    }
    // a few rocks and flowers near the front
    const rocks = this.geo('rockGrey');
    for (let i = 0; i < 18; i++) {
      const side = i % 2 ? 1 : -1;
      append(rocks, rock(rng.int(1, 1e6), rng.float(0.12, 0.35), 0), trs(side * rng.float(HALF + 1.2, 30), 0.05, -rng.float(0.4, 6)));
    }
    for (let i = 0; i < 46; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * rng.float(HALF + 0.6, 24);
      const z = -rng.float(0, 5);
      append(this.geo('leaves2'), prim.cylinder(0.012, 0.2, 4), trs(x, 0.1, z));
      append(this.geo(rng.pick(['flowerRed', 'flowerYellow', 'flowerWhite'])), prim.sphere(0.05, 5, 6), trs(x, 0.21, z));
    }
  }

  buildMountains(rng) {
    for (let i = 0; i < 9; i++) {
      const far = i < 4;
      const x = -150 + i * 38 + rng.float(-12, 12);
      const z = far ? -170 - rng.float(0, 20) : -115 - rng.float(0, 20);
      const r = rng.float(28, 46) * (far ? 1.3 : 1);
      const h = rng.float(26, 44) * (far ? 1.35 : 1);
      const seed = rng.int(1, 1e6);
      append(this.geo(far ? 'mountainFar' : 'mountain'), lowCone(r, h, 9, seed, 0.2), trs(x, -2, z));
      append(this.geo('snow'), lowCone(r * 0.32, h * 0.32, 9, seed, 0.25), trs(x, -2 + h * 0.69, z));
    }
    // rolling hills between the forest and mountains
    for (let i = 0; i < 7; i++) {
      append(this.geo(i % 2 ? 'leaves' : 'leaves2'), rock(rng.int(1, 1e6), rng.float(14, 22), 1, 0.08, [1.6, 0.35, 1]),
        trs(-120 + i * 40 + rng.float(-8, 8), -2, -80 - rng.float(0, 20)));
    }
  }

  buildSky() {
    const sky = geo();
    sky.positions.push(-700, -60, -260, 700, -60, -260, 700, 260, -260, -700, 260, -260);
    for (let i = 0; i < 4; i++) sky.normals.push(0, 0, 1);
    sky.uvs.push(0, 1, 1, 1, 1, 0, 0, 0);
    sky.indices.push(0, 1, 2, 0, 2, 3);
    this.addEntity('sky', sky, 'sky');

    const sun = geo();
    append(sun, prim.sphere(9, 12, 16), trs(70, 85, -240));
    this.addEntity('sun', sun, 'sun');

    const rng = new Rng(77);
    for (let i = 0; i < 7; i++) {
      const g = geo();
      const puffs = rng.int(4, 7);
      for (let k = 0; k < puffs; k++) {
        append(g, prim.sphere(rng.float(3, 5.5), 8, 10), trs(k * 3.2 - puffs * 1.6, rng.float(-0.5, 1.5), rng.float(-1.5, 1.5), 0, 0, 0, 1, 0.55, 0.8));
      }
      const e = this.addEntity(`cloud${i}`, g, 'cloud');
      const cloud = { e, x: rng.float(-220, 220), y: rng.float(40, 75), z: -rng.float(120, 200), speed: rng.float(0.6, 1.4) };
      e.setPosition(cloud.x, cloud.y, cloud.z);
      this.clouds.push(cloud);
    }
  }

  update(dt) {
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > 260) c.x = -260;
      c.e.setPosition(c.x, c.y, c.z);
    }
  }
}
