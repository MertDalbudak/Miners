/*
  Static mine structure: back wall behind the shaft, side rock, timber frame,
  lanterns and biome decorations on the side walls.
*/

import * as pc from 'playcanvas';
import { Rng } from '../core/rng.js';
import { GameConfig } from '../config.js';
import { BIOMES } from '../game/biomes.js';
import { geo, append, merge, trs, prim, toMesh, rock, crystal } from './geometry.js';
import { quad, boxUV } from './models.js';
import { Mask } from './masks.js';
import { cellY } from './blocks-view.js';

const HALF = GameConfig.COLS / 2;
const WALL_FRONT = 0.62;
const WALL_EXTENT = 70;
const DEEPEST_ROW = 6000;
const LANTERN_SPACING = 11;

// Row range [start, end) covered by each biome
export function biomeRows(index) {
  const S = GameConfig.SURFACE_ROWS;
  const start = Math.max(S, BIOMES[index].from + S - 1);
  const end = index + 1 < BIOMES.length ? BIOMES[index + 1].from + S - 1 : DEEPEST_ROW;
  return [start, end];
}

export class WallsView {
  constructor(app, materials, models) {
    this.app = app;
    this.device = app.graphicsDevice;
    this.materials = materials;
    this.models = models;
    this.root = new pc.Entity('walls');
    app.root.addChild(this.root);
    this.lanterns = [];
    this.lights = [];
    this.build();
  }

  addMesh(name, g, material, mask, tangents = true) {
    const mesh = toMesh(this.device, g, { tangents });
    const e = new pc.Entity(name);
    const mi = new pc.MeshInstance(mesh, this.materials.get(material), e);
    mi.mask = mask;
    e.addComponent('render', { meshInstances: [mi] });
    mi.mask = mask;
    this.root.addChild(e);
    return e;
  }

  build() {
    BIOMES.forEach((biome, i) => {
      const [start, end] = biomeRows(i);
      const top = cellY(start) + 0.5;
      const bottom = cellY(end - 1) - 0.5;

      // Back wall behind the playfield
      this.addMesh(`back_${biome.key}`, quad(-HALF, bottom, HALF, top, -0.5, 0.5), `back_${biome.key}`, Mask.PLAYFIELD);

      // Side rock: front faces and the inner faces bordering the shaft
      const side = geo();
      append(side, quad(-WALL_EXTENT, bottom, -HALF - 0.02, top, WALL_FRONT, 0.14));
      append(side, quad(HALF + 0.02, bottom, WALL_EXTENT, top, WALL_FRONT, 0.14));
      const inner = geo();
      inner.positions.push(
        -HALF, bottom, -0.5, -HALF, bottom, WALL_FRONT, -HALF, top, WALL_FRONT, -HALF, top, -0.5,
        HALF, bottom, WALL_FRONT, HALF, bottom, -0.5, HALF, top, -0.5, HALF, top, WALL_FRONT
      );
      for (let k = 0; k < 4; k++) inner.normals.push(1, 0, 0);
      for (let k = 0; k < 4; k++) inner.normals.push(-1, 0, 0);
      inner.uvs.push(0, -bottom * 0.5, 0.5, -bottom * 0.5, 0.5, -top * 0.5, 0, -top * 0.5);
      inner.uvs.push(0, -bottom * 0.5, 0.5, -bottom * 0.5, 0.5, -top * 0.5, 0, -top * 0.5);
      inner.indices.push(0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7);
      append(side, inner);
      this.addMesh(`rock_${biome.key}`, side, `rock_${biome.key}`, Mask.WALLS);

      // Timber: vertical posts along the shaft edges, cross beams on the back wall
      const timber = geo();
      const h = (top - bottom) / 2;
      const midY = (top + bottom) / 2;
      append(timber, boxUV(0.14, h, 0.14, 1), trs(-HALF - 0.04, midY, WALL_FRONT));
      append(timber, boxUV(0.14, h, 0.14, 1), trs(HALF + 0.04, midY, WALL_FRONT));
      const beamTimber = geo();
      for (let r = start + 3; r < Math.min(end, start + 400); r += 8) {
        append(beamTimber, boxUV(HALF, 0.09, 0.05, 1), trs(0, cellY(r) + 0.42, -0.46));
      }
      this.addMesh(`timber_${biome.key}`, timber, 'darkwood', Mask.WALLS);
      if (beamTimber.positions.length) this.addMesh(`beams_${biome.key}`, beamTimber, 'darkwood', Mask.PLAYFIELD);

      this.buildDecor(biome, i, start, Math.min(end, start + 400));
    });

    this.buildLanterns();
  }

  buildDecor(biome, index, start, end) {
    const rng = new Rng(900 + index * 31);
    const props = new Map();
    const add = (material, g, mat) => {
      if (!props.has(material)) props.set(material, geo());
      append(props.get(material), g, mat);
    };

    for (let r = start; r < end; r += 2) {
      for (const side of [-1, 1]) {
        if (!rng.chance(0.55)) continue;
        const x = side * (HALF + rng.float(0.6, 9));
        const y = cellY(r) + rng.float(-0.5, 0.5);
        const z = WALL_FRONT;
        switch (biome.key) {
          case 'topsoil':
            if (rng.chance(0.6)) {
              // roots
              let rx = x;
              let ry = y;
              let a = rng.float(-0.8, 0.8) - Math.PI / 2;
              for (let s = 0; s < 6; s++) {
                add('trunk', prim.cylinder(0.05 - s * 0.006, 0.4, 6), trs(rx, ry, z + 0.02, 0, 0, (a * 180) / Math.PI + 90));
                rx += Math.cos(a) * 0.35;
                ry += Math.sin(a) * 0.35;
                a += rng.float(-0.5, 0.5);
              }
            } else {
              add('rockGrey', rock(rng.int(1, 1e6), rng.float(0.12, 0.3), 0), trs(x, y, z));
            }
            break;
          case 'clay':
            if (rng.chance(0.2)) {
              // an old bone
              add('white', prim.capsule(0.05, 0.5, 6), trs(x, y, z, 0, 0, rng.float(-60, 60)));
            } else {
              add('rockGrey', rock(rng.int(1, 1e6), rng.float(0.12, 0.28), 0), trs(x, y, z));
            }
            break;
          case 'granite':
            add('stone', rock(rng.int(1, 1e6), rng.float(0.15, 0.35), 0), trs(x, y, z));
            break;
          case 'magma':
            add(rng.chance(0.5) ? 'magma' : 'stone', rock(rng.int(1, 1e6), rng.float(0.12, 0.3), 0), trs(x, y, z));
            break;
          case 'crystal': {
            const color = rng.chance(0.5) ? 'gem3' : 'diamond';
            for (let k = 0; k < 3; k++) {
              add(color, crystal(rng.float(0.05, 0.1), rng.float(0.2, 0.45), 0.1),
                trs(x + rng.float(-0.2, 0.2), y + rng.float(-0.2, 0.2), z, 90 + rng.float(-30, 30), 0, rng.float(-40, 40)));
            }
            break;
          }
        }
      }
    }
    for (const [material, g] of props) {
      this.addMesh(`decor_${biome.key}_${material}`, g, material, Mask.WALLS, false);
    }
  }

  buildLanterns() {
    const frame = geo();
    const glass = geo();
    const S = GameConfig.SURFACE_ROWS;
    let side = -1;
    for (let r = S + 5; r < S + 1200; r += LANTERN_SPACING) {
      const x = side * (HALF + 0.42);
      const y = cellY(r) + 0.3;
      const z = WALL_FRONT + 0.2;
      append(frame, prim.box(0.13, 0.03, 0.13), trs(x, y + 0.17, z));
      append(frame, prim.box(0.13, 0.03, 0.13), trs(x, y - 0.17, z));
      append(frame, prim.cylinder(0.012, 0.3, 4), trs(x, y + 0.33, z));
      append(frame, prim.box(0.28, 0.025, 0.025), trs(x - side * 0.14, y + 0.47, z - 0.05));
      append(glass, prim.cylinder(0.09, 0.3, 8), trs(x, y, z));
      this.lanterns.push({ x, y, z, phase: r * 1.7 });
      side = -side;
    }
    this.addMesh('lanternFrames', frame, 'darkmetal', Mask.WALLS, false);
    this.addMesh('lanternGlass', glass, 'lanternGlass', Mask.WALLS, false);

    // A small pool of lights follows the lanterns closest to the camera
    for (let i = 0; i < 4; i++) {
      const e = new pc.Entity(`lanternLight${i}`);
      e.addComponent('light', {
        type: 'omni',
        color: new pc.Color(1, 0.72, 0.38),
        intensity: 1.4,
        range: 4.2,
        falloffMode: pc.LIGHTFALLOFF_LINEAR,
        castShadows: false,
        affectDynamic: false,
        affectLightmapped: true,
        bake: false
      });
      this.root.addChild(e);
      this.lights.push(e);
    }
  }

  update(time, cameraY) {
    const sorted = this.lanterns
      .map(l => ({ l, d: Math.abs(l.y - cameraY) }))
      .sort((a, b) => a.d - b.d);
    this.lights.forEach((e, i) => {
      const entry = sorted[i];
      if (!entry || entry.d > 18) {
        e.enabled = false;
        return;
      }
      const l = entry.l;
      e.enabled = true;
      e.setPosition(l.x, l.y, l.z + 0.4);
      e.light.intensity = 1.25 + Math.sin(time * 9 + l.phase) * 0.08 + Math.sin(time * 23 + l.phase) * 0.05;
    });
  }
}
