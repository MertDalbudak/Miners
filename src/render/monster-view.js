/*
  Cave monsters. Their glowing eyes stay visible in the dark - a warning.
*/

import * as pc from 'playcanvas';
import { geo, append, merge, trs, prim, toMesh, rock } from './geometry.js';
import { Mask } from './masks.js';
import { cellX, cellY } from './blocks-view.js';

function lerp(a, b, t) {
  return a + (b - a) * t;
}

let sharedMeshes = null;

function buildMeshes(device) {
  const m = {};
  // Crawler: spiky blob with a toothy grin
  m.crawlerBody = toMesh(device, merge([[rock(7, 0.3, 2, 0.06, [1, 0.88, 0.95]), trs(0, 0, 0)]]));
  const spikes = geo();
  const spikeCount = 9;
  for (let i = 0; i < spikeCount; i++) {
    const a = (i / spikeCount) * 300 - 150;
    append(spikes, prim.cone(0.07, 0, 0.2, 5), trs(Math.sin((a * Math.PI) / 180) * 0.26, Math.cos((a * Math.PI) / 180) * 0.24, -0.04, 0, 0, -a));
  }
  for (const s of [-1, 1]) {
    append(spikes, prim.cone(0.05, 0.02, 0.12, 5), trs(s * 0.17, -0.27, 0.06, 0, 0, s * 15));
    append(spikes, prim.cone(0.05, 0.02, 0.12, 5), trs(s * 0.07, -0.29, 0.12, 0, 0, s * 8));
  }
  m.crawlerSpikes = toMesh(device, spikes);
  m.eye = toMesh(device, prim.sphere(0.08, 10, 12));
  m.pupil = toMesh(device, prim.sphere(0.036, 8, 10));
  m.mouth = toMesh(device, merge([[prim.sphere(0.13, 10, 12), trs(0, 0, 0, 0, 0, 0, 1.3, 0.55, 0.5)]]));
  const teeth = geo();
  for (let i = 0; i < 5; i++) {
    append(teeth, prim.cone(0.025, 0, 0.06, 4), trs(-0.12 + i * 0.06, 0.03, 0.05, 180, 0, 0));
  }
  for (let i = 0; i < 4; i++) {
    append(teeth, prim.cone(0.022, 0, 0.05, 4), trs(-0.09 + i * 0.06, -0.035, 0.05, 0, 0, 0));
  }
  m.teeth = toMesh(device, teeth);

  // Burrower: mole with a drill nose
  m.burrowerBody = toMesh(device, merge([[prim.sphere(0.28, 12, 16), trs(0, 0, 0, 0, 0, 0, 1.15, 0.9, 1)]]));
  const drill = geo();
  append(drill, prim.cone(0.16, 0.0, 0.3, 10), trs(0, 0, 0));
  for (let i = 0; i < 3; i++) append(drill, prim.torus(0.015, 0.13 - i * 0.04, 12, 4), trs(0, -0.08 + i * 0.08, 0));
  m.drill = toMesh(device, drill);
  const claws = geo();
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) append(claws, prim.cone(0.03, 0, 0.1, 4), trs(s * (0.2 + i * 0.03), -0.22, 0.12 - i * 0.05, 30, 0, s * 20));
  }
  m.claws = toMesh(device, claws);
  return m;
}

class MonsterModel {
  constructor(view, monster) {
    this.view = view;
    this.monster = monster;
    this.kind = monster.kind;
    this.root = new pc.Entity(`monster${monster.id}`);
    this.body = new pc.Entity('body');
    this.root.addChild(this.body);
    this.meshInstances = [];
    const meshes = view.meshes;
    const mat = view.materials;

    if (this.kind === 'burrower') {
      this.add(this.body, meshes.burrowerBody, mat.get('burrower'));
      this.add(this.body, meshes.claws, mat.get('teeth'));
      this.drill = new pc.Entity('drill');
      this.drill.setLocalPosition(0.32, 0, 0);
      this.drill.setLocalEulerAngles(0, 0, -90);
      this.body.addChild(this.drill);
      this.add(this.drill, meshes.drill, mat.get('metal'));
      this.eyes = new pc.Entity('eyes');
      this.body.addChild(this.eyes);
      for (const s of [-1, 1]) {
        const e = this.add(this.eyes, meshes.eye, mat.get('monsterEyeGreen'), [s * 0.1, 0.1, 0.24], 0.65);
        this.add(e, meshes.pupil, mat.get('pupil'), [0, 0, 0.05], 0.9);
      }
    } else {
      this.add(this.body, meshes.crawlerBody, mat.get('crawler'));
      this.add(this.body, meshes.crawlerSpikes, mat.get('crawlerDark'));
      this.mouth = new pc.Entity('mouth');
      this.mouth.setLocalPosition(0, -0.09, 0.22);
      this.body.addChild(this.mouth);
      this.add(this.mouth, meshes.mouth, mat.get('mouth'));
      this.add(this.mouth, meshes.teeth, mat.get('teeth'));
      this.eyes = new pc.Entity('eyes');
      this.body.addChild(this.eyes);
      for (const s of [-1, 1]) {
        const e = this.add(this.eyes, meshes.eye, mat.get('monsterEye'), [s * 0.11, 0.08, 0.23]);
        this.add(e, meshes.pupil, mat.get('pupil'), [s * -0.01, 0, 0.06]);
      }
    }

    this.root.setLocalScale(1.25, 1.25, 1.25);
    view.root.addChild(this.root);
    this.x = cellX(monster.c);
    this.y = cellY(monster.r);
    this.motion = null;
    this.time = Math.random() * 10;
    this.lid = monster.state === 'sleep' ? 0.12 : 1;
    this.facing = 1;
    this.lunge = 0;
    this.dying = null;
    this.zzz = 0;
    this.root.setPosition(this.x, this.y, 0);
  }

  add(parent, mesh, material, pos = [0, 0, 0], scale = 1) {
    const e = new pc.Entity();
    const mi = new pc.MeshInstance(mesh, material, e);
    mi.mask = Mask.PLAYFIELD;
    e.addComponent('render', { meshInstances: [mi] });
    mi.mask = Mask.PLAYFIELD;
    e.setLocalPosition(...pos);
    e.setLocalScale(scale, scale, scale);
    parent.addChild(e);
    this.meshInstances.push(mi);
    return e;
  }

  moveTo(c, r, duration) {
    const tx = cellX(c);
    const ty = cellY(r);
    if (tx !== this.x) this.facing = tx > this.x ? 1 : -1;
    this.motion = { fx: this.x, fy: this.y, tx, ty, t: 0, d: Math.max(0.08, duration) };
  }

  attack() {
    this.lunge = 1;
  }

  die(cause) {
    this.dying = { t: 0, cause };
  }

  destroy() {
    this.root.destroy();
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    const m = this.monster;

    if (this.motion) {
      const mo = this.motion;
      mo.t += dt;
      const k = Math.min(1, mo.t / mo.d);
      const e = k * k * (3 - 2 * k);
      this.x = lerp(mo.fx, mo.tx, e);
      this.y = lerp(mo.fy, mo.ty, e) + Math.sin(k * Math.PI) * 0.12;
      if (k >= 1) this.motion = null;
    }

    if (this.dying) {
      const d = this.dying;
      d.t += dt;
      const k = Math.min(1, d.t / 0.3);
      const sx = d.cause === 'boulder' ? 1 + k * 0.6 : 1 - k;
      const sy = d.cause === 'boulder' ? Math.max(0.05, 1 - k) : 1 - k;
      this.body.setLocalScale(Math.max(0.01, sx), Math.max(0.01, sy), Math.max(0.01, 1 - k * 0.5));
      this.root.setPosition(this.x, this.y - (d.cause === 'boulder' ? k * 0.3 : 0), 0);
      return d.t > 0.35;
    }

    const awake = m.state !== 'sleep';
    this.lid = lerp(this.lid, awake ? 1 : 0.12, 1 - Math.exp(-dt * (awake ? 14 : 4)));
    this.eyes.setLocalScale(1, this.lid, 1);

    // breathing / bobbing, faster when hunting
    const speed = m.state === 'hunt' ? 7 : 2.2;
    const bob = Math.sin(t * speed) * (m.state === 'hunt' ? 0.04 : 0.02);
    const squash = 1 + Math.sin(t * speed * 2) * 0.03;
    const shiver = m.state === 'waking' ? Math.sin(t * 60) * 0.04 : 0;
    this.lunge = Math.max(0, this.lunge - dt * 4);

    this.body.setLocalScale(1 / Math.sqrt(squash), squash, 1);
    this.body.setLocalEulerAngles(0, this.facing * 20, Math.sin(t * speed * 0.5) * 4);
    this.root.setPosition(this.x + shiver, this.y + bob - 0.05, 0.05 + this.lunge * 0.3);
    if (this.mouth) this.mouth.setLocalScale(1, 1 + Math.abs(Math.sin(t * (m.state === 'hunt' ? 9 : 1.5))) * 0.4 + this.lunge, 1);
    if (this.drill) {
      this.drill.setLocalEulerAngles(t * (m.state === 'hunt' ? 900 : 120), 0, -90);
      this.body.setLocalEulerAngles(0, this.facing > 0 ? 0 : 180, 0);
    }
    return false;
  }
}

export class MonsterViews {
  constructor(app, materials) {
    this.app = app;
    this.materials = materials;
    if (!sharedMeshes) sharedMeshes = buildMeshes(app.graphicsDevice);
    this.meshes = sharedMeshes;
    this.root = new pc.Entity('monsters');
    app.root.addChild(this.root);
    this.models = new Map();
  }

  clear() {
    for (const model of this.models.values()) model.destroy();
    this.models.clear();
  }

  spawn(monster) {
    if (this.models.has(monster.id)) return this.models.get(monster.id);
    const model = new MonsterModel(this, monster);
    this.models.set(monster.id, model);
    return model;
  }

  get(monster) {
    return this.models.get(monster.id) || this.spawn(monster);
  }

  remove(monster, cause) {
    const model = this.models.get(monster.id);
    if (!model) return;
    if (cause) model.die(cause);
    else {
      model.destroy();
      this.models.delete(monster.id);
    }
  }

  update(dt) {
    for (const [id, model] of this.models) {
      if (model.update(dt)) {
        model.destroy();
        this.models.delete(id);
      }
    }
  }
}
