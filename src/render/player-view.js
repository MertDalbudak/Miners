/*
  The miner - an original character built from primitives and animated in code.
*/

import * as pc from 'playcanvas';
import { geo, append, merge, trs, prim, toMesh, roundedBox } from './geometry.js';
import { Mask } from './masks.js';
import { cellX, cellY } from './blocks-view.js';

const FEET = -0.47;

function ease(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function approach(current, target, lambda, dt) {
  return target + (current - target) * Math.exp(-lambda * dt);
}

export class PlayerView {
  constructor(app, materials) {
    this.app = app;
    this.device = app.graphicsDevice;
    this.mat = materials;
    this.meshInstances = [];
    this.root = new pc.Entity('miner');
    app.root.addChild(this.root);
    this.build();
    this.reset(4, 1);
  }

  part(parent, name, g, material, pos = [0, 0, 0]) {
    const e = new pc.Entity(name);
    const mi = new pc.MeshInstance(toMesh(this.device, g), this.mat.get(material), e);
    e.addComponent('render', { meshInstances: [mi] });
    e.setLocalPosition(...pos);
    parent.addChild(e);
    this.meshInstances.push(mi);
    return e;
  }

  pivot(parent, name, pos = [0, 0, 0]) {
    const e = new pc.Entity(name);
    e.setLocalPosition(...pos);
    parent.addChild(e);
    return e;
  }

  build() {
    this.yawNode = this.pivot(this.root, 'yaw', [0, FEET, 0]);
    this.body = this.pivot(this.yawNode, 'body');
    const body = this.body;

    // Torso: cream shirt, teal overalls with bib, straps and brass buttons
    this.part(body, 'shirt', merge([[roundedBox(0.5, 0.18, 2), trs(0, 0.37, 0, 0, 0, 0, 0.3, 0.26, 0.22)]]), 'shirt');
    const overalls = geo();
    append(overalls, roundedBox(0.5, 0.15, 2), trs(0, 0.255, 0, 0, 0, 0, 0.32, 0.17, 0.24));
    append(overalls, prim.box(0.085, 0.065, 0.012), trs(0, 0.35, 0.112));
    append(overalls, prim.box(0.022, 0.1, 0.012), trs(-0.075, 0.43, 0.105, 0, 0, 0));
    append(overalls, prim.box(0.022, 0.1, 0.012), trs(0.075, 0.43, 0.105, 0, 0, 0));
    append(overalls, prim.box(0.022, 0.012, 0.13), trs(-0.075, 0.5, 0.0));
    append(overalls, prim.box(0.022, 0.012, 0.13), trs(0.075, 0.5, 0.0));
    this.part(body, 'overalls', overalls, 'overalls');
    const buttons = geo();
    append(buttons, prim.sphere(0.017, 6, 8), trs(-0.062, 0.405, 0.12));
    append(buttons, prim.sphere(0.017, 6, 8), trs(0.062, 0.405, 0.12));
    this.part(body, 'buttons', buttons, 'button');
    this.part(body, 'bandana', merge([
      [prim.torus(0.035, 0.115, 16, 8), trs(0, 0.5, 0, 0, 0, 0, 1, 1, 0.9)],
      [prim.cone(0.05, 0.005, 0.09, 4), trs(0, 0.45, 0.11, 200, 0, 0)]
    ]), 'bandana');

    // Backpack with a bedroll
    this.part(body, 'pack', merge([[roundedBox(0.5, 0.12, 2), trs(0, 0.36, -0.17, 0, 0, 0, 0.22, 0.24, 0.12)]]), 'pack');
    this.part(body, 'bedroll', merge([[prim.cylinder(0.055, 0.26, 10), trs(0, 0.5, -0.17, 0, 0, 90)]]), 'bedroll');

    // Head
    this.head = this.pivot(body, 'head', [0, 0.52, 0]);
    const head = this.head;
    this.part(head, 'face', merge([
      [prim.sphere(0.165, 14, 18), trs(0, 0.16, 0)],
      [prim.sphere(0.035, 6, 8), trs(-0.162, 0.15, 0)],
      [prim.sphere(0.035, 6, 8), trs(0.162, 0.15, 0)]
    ]), 'skin');
    this.part(head, 'nose', merge([[prim.sphere(0.045, 8, 10), trs(0, 0.13, 0.165)]]), 'nose');
    this.eyes = this.pivot(head, 'eyes', [0, 0.185, 0.147]);
    this.part(this.eyes, 'eyeballs', merge([
      [prim.sphere(0.028, 8, 10), trs(-0.062, 0, 0)],
      [prim.sphere(0.028, 8, 10), trs(0.062, 0, 0)]
    ]), 'eye');
    this.part(head, 'brows', merge([
      [prim.box(0.035, 0.009, 0.01), trs(-0.062, 0.235, 0.155, 0, 0, 8)],
      [prim.box(0.035, 0.009, 0.01), trs(0.062, 0.235, 0.155, 0, 0, -8)]
    ]), 'brow');
    this.part(head, 'mustache', merge([
      [prim.sphere(0.04, 6, 8), trs(-0.038, 0.088, 0.16, 0, 0, 0, 1.2, 0.55, 0.6)],
      [prim.sphere(0.04, 6, 8), trs(0.038, 0.088, 0.16, 0, 0, 0, 1.2, 0.55, 0.6)]
    ]), 'brow');

    // Hard hat with headlamp
    const hat = this.pivot(head, 'hat', [0, 0.235, 0]);
    this.part(hat, 'dome', merge([[prim.sphere(0.19, 12, 18), trs(0, 0, -0.005, 0, 0, 0, 1, 0.78, 1.05)]]), 'hat');
    this.part(hat, 'brim', merge([
      [prim.cylinder(0.215, 0.026, 22), trs(0, -0.012, 0.015)],
      [prim.sphere(1, 8, 10), trs(0, 0.128, -0.01, 0, 0, 0, 0.032, 0.03, 0.17)]
    ]), 'hat');
    this.part(hat, 'lampHousing', merge([[prim.cylinder(0.052, 0.06, 12), trs(0, 0.07, 0.185, 90, 0, 0)]]), 'darkmetal');
    this.lens = this.part(hat, 'lens', merge([[prim.cylinder(0.04, 0.02, 12), trs(0, 0.07, 0.218, 90, 0, 0)]]), 'lens');

    // Arms (pivot at the shoulder)
    this.armL = this.pivot(body, 'armL', [-0.185, 0.46, 0]);
    this.armR = this.pivot(body, 'armR', [0.185, 0.46, 0]);
    for (const arm of [this.armL, this.armR]) {
      this.part(arm, 'sleeve', merge([[prim.capsule(0.052, 0.2, 8), trs(0, -0.08, 0)]]), 'shirt');
      this.part(arm, 'glove', merge([[prim.sphere(0.062, 8, 10), trs(0, -0.2, 0.005)]]), 'gloves');
    }

    // Pickaxe held in the right hand
    this.pick = this.pivot(this.armR, 'pickaxe', [0, -0.2, 0.02]);
    this.part(this.pick, 'pickHandle', merge([[prim.cylinder(0.02, 0.44, 8), trs(0, 0.0, 0.12, 90, 0, 0)]]), 'plainwood');
    // curved double-pointed head
    const head2 = geo();
    append(head2, prim.cone(0.04, 0.006, 0.17, 8), trs(0, 0.085, -0.025, -22, 0, 0));
    append(head2, prim.cone(0.04, 0.006, 0.17, 8), trs(0, -0.085, -0.025, 202, 0, 0));
    append(head2, prim.box(0.04, 0.035, 0.04), trs(0, 0, 0));
    this.part(this.pick, 'pickHead', merge([[head2, trs(0, 0, 0.34, 0, 0, 0, 1, 1.1, 1)]]), 'metal');

    // Legs (pivot at the hip)
    this.legL = this.pivot(body, 'legL', [-0.085, 0.18, 0]);
    this.legR = this.pivot(body, 'legR', [0.085, 0.18, 0]);
    for (const leg of [this.legL, this.legR]) {
      this.part(leg, 'trouser', merge([[prim.cylinder(0.062, 0.14, 10), trs(0, -0.07, 0)]]), 'overalls');
      this.part(leg, 'boot', merge([[roundedBox(0.5, 0.2, 2), trs(0, -0.155, 0.025, 0, 0, 0, 0.12, 0.07, 0.17)]]), 'boots');
    }
  }

  setMask(mask) {
    if (mask === this.mask) return;
    this.mask = mask;
    for (const mi of this.meshInstances) mi.mask = mask;
  }

  reset(c, r) {
    this.x = cellX(c);
    this.y = cellY(r);
    this.motion = null;
    this.action = null;
    this.state = 'idle';
    this.facing = 1;
    this.yaw = 20;
    this.targetYaw = 20;
    this.squash = 1;
    this.time = 0;
    this.blink = 2 + Math.random() * 2;
    this.deathTime = 0;
    this.death = null;
    this.armsUp = 0;
    this.cheerQueued = false;
    this.lampLevel = 1;
    this.root.enabled = true;
    this.root.setLocalScale(1, 1, 1);
    this.yawNode.setLocalPosition(0, FEET, 0);
    this.yawNode.setLocalEulerAngles(0, 0, 0);
    this.body.setLocalEulerAngles(0, 0, 0);
    this.updateTransform();
  }

  // Smoothly move from the current visual position to cell (c, r)
  moveTo(c, r, duration, kind = 'move') {
    const tx = cellX(c);
    const ty = cellY(r);
    this.motion = { fromX: this.x, fromY: this.y, toX: tx, toY: ty, t: 0, duration, kind };
  }

  setFacing(dir) {
    if (dir === 'left') this.facing = -1;
    if (dir === 'right') this.facing = 1;
  }

  play(type, duration = 0.2, data = {}) {
    this.action = { type, t: 0, duration, ...data };
  }

  onMove(e, dug) {
    this.setFacing(e.dir);
    if (e.dir === 'down') {
      this.targetYaw = 0;
      this.play(dug ? 'digDown' : 'stepDown', e.duration);
    } else {
      this.targetYaw = this.facing * 70;
      this.play(dug ? 'dig' : 'walk', e.duration);
    }
    this.moveTo(e.to.c, e.to.r, e.duration, dug ? 'dig' : 'move');
  }

  onSwing(dir, kind = 'hit') {
    this.setFacing(dir);
    this.targetYaw = dir === 'down' ? 0 : this.facing * 70;
    this.play(kind, kind === 'bump' ? 0.25 : 0.2, { dir });
  }

  onFall(e) {
    this.state = 'falling';
    this.moveTo(e.to.c, e.to.r, e.duration, 'fall');
  }

  onLand(steps) {
    this.state = 'idle';
    this.squash = steps > 2 ? 0.62 : 0.8;
  }

  onCelebrate() {
    this.cheerQueued = true;
  }

  die(cause, extra = {}) {
    this.death = { cause, t: 0, ...extra };
    this.state = 'dead';
  }

  updateTransform() {
    this.root.setPosition(this.x, this.y, 0);
  }

  get headWorld() {
    return this.lens.getPosition();
  }

  update(dt) {
    this.time += dt;
    const t = this.time;

    // Position motion
    let hop = 0;
    if (this.motion) {
      const m = this.motion;
      m.t += dt;
      const k = Math.min(1, m.t / m.duration);
      if (m.kind === 'fall') {
        this.x = lerp(m.fromX, m.toX, k);
        this.y = lerp(m.fromY, m.toY, k);
      } else {
        // digging moves only after the swing connects
        const start = m.kind === 'dig' ? 0.35 : 0;
        const kk = Math.max(0, (k - start) / (1 - start));
        const e = ease(kk);
        this.x = lerp(m.fromX, m.toX, e);
        this.y = lerp(m.fromY, m.toY, e);
        if (m.fromY === m.toY) hop = Math.sin(kk * Math.PI) * 0.1;
      }
      if (k >= 1) this.motion = null;
    }

    if (this.death) {
      this.updateDeath(dt);
      return;
    }

    this.yaw = approach(this.yaw, this.targetYaw, 12, dt);
    if (!this.action && !this.motion && this.state === 'idle') {
      // relax into a three-quarter pose towards the camera
      this.targetYaw = this.facing * 25;
    }

    if (this.cheerQueued && !this.action && !this.motion) {
      this.cheerQueued = false;
      this.play('cheer', 0.45);
    }

    this.squash = approach(this.squash, 1, 10, dt);
    this.armsUp = approach(this.armsUp, this.state === 'falling' ? 1 : 0, 10, dt);

    // Defaults: idle breathing and swinging limbs
    const breathe = Math.sin(t * 2.4) * 0.012;
    let armL = Math.sin(t * 1.6) * 4;
    let armR = -10 + Math.sin(t * 1.6 + 1) * 4;
    let armRz = 0;
    let legL = 0;
    let legR = 0;
    let lean = 0;
    let headTilt = Math.sin(t * 0.7) * 3;
    let bodyY = 0;

    const a = this.action;
    if (a) {
      a.t += dt;
      const k = Math.min(1, a.t / a.duration);
      switch (a.type) {
        case 'walk':
        case 'stepDown':
          legL = Math.sin(k * Math.PI * 2) * 35;
          legR = -legL;
          armL = -legL * 0.6;
          break;
        case 'dig':
        case 'hit': {
          // raise then strike forward
          const swing = k < 0.4 ? -k / 0.4 : -1 + (k - 0.4) / 0.6 * 2.2;
          armR = -20 + swing * -95;
          lean = (k < 0.4 ? -6 : 10) * Math.sin(k * Math.PI);
          legL = Math.sin(k * Math.PI * 2) * 20;
          legR = -legL;
          break;
        }
        case 'digDown': {
          const swing = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6;
          armR = -40 - swing * 140;
          armL = -swing * 40;
          lean = swing * 10;
          break;
        }
        case 'bump':
          lean = -Math.sin(k * Math.PI) * 14;
          headTilt += Math.sin(k * Math.PI * 4) * 12;
          break;
        case 'cheer':
          armL = -150 * Math.sin(k * Math.PI);
          armR = -150 * Math.sin(k * Math.PI);
          bodyY = Math.sin(k * Math.PI) * 0.08;
          break;
      }
      if (k >= 1) this.action = null;
    }

    if (this.armsUp > 0.01) {
      armL = lerp(armL, -160, this.armsUp);
      armR = lerp(armR, -160, this.armsUp);
      armRz = lerp(0, -15, this.armsUp);
      legL = lerp(legL, Math.sin(t * 20) * 20, this.armsUp);
      legR = -legL;
    }

    // Blink
    this.blink -= dt;
    let eyeScale = 1;
    if (this.blink < 0.12) eyeScale = 0.15;
    if (this.blink < 0) this.blink = 2.5 + Math.random() * 3;
    this.eyes.setLocalScale(1, eyeScale, 1);

    this.armL.setLocalEulerAngles(armL, 0, 6);
    this.armR.setLocalEulerAngles(armR, 0, -6 + armRz);
    this.legL.setLocalEulerAngles(legL, 0, 0);
    this.legR.setLocalEulerAngles(legR, 0, 0);
    this.head.setLocalEulerAngles(0, 0, headTilt);
    this.body.setLocalEulerAngles(lean, 0, 0);
    this.body.setLocalPosition(0, hop + bodyY, 0);
    const sq = this.squash;
    this.yawNode.setLocalScale(1 + (1 - sq) * 0.6, sq * (1 + breathe), 1 + (1 - sq) * 0.6);
    this.yawNode.setLocalEulerAngles(0, this.yaw, 0);
    this.updateTransform();
  }

  updateDeath(dt) {
    const d = this.death;
    d.t += dt;
    const t = d.t;
    switch (d.cause) {
      case 'tnt': {
        // blasted up and away, tumbling
        const vx = (d.dir || 1) * 2.2;
        this.root.setPosition(this.x + vx * t, this.y + 4.5 * t - 9 * t * t, 0.9 + t * 1.5);
        this.yawNode.setLocalEulerAngles(t * 520, t * 300, t * 200);
        const s = Math.max(0, 1 - t * 0.6);
        this.root.setLocalScale(s, s, s);
        if (t > 1.6) this.root.enabled = false;
        return;
      }
      case 'monster': {
        const k = Math.min(1, t / 0.35);
        const s = Math.max(0.001, 1 - k);
        const tx = d.mx ?? this.x;
        const ty = d.my ?? this.y;
        this.root.setPosition(lerp(this.x, tx, k * 0.7), lerp(this.y, ty, k * 0.7), 0);
        this.root.setLocalScale(s, s, s);
        if (k >= 1) this.root.enabled = false;
        return;
      }
      case 'crushed': {
        const k = Math.min(1, t / 0.12);
        this.yawNode.setLocalScale(1 + k * 0.5, Math.max(0.12, 1 - k * 0.88), 1 + k * 0.3);
        this.updateTransform();
        return;
      }
      default: {
        // exhausted / trapped: slump down and let the lamp die out
        const k = Math.min(1, t / 0.8);
        this.yaw = approach(this.yaw, 0, 6, dt);
        this.yawNode.setLocalEulerAngles(0, this.yaw, 0);
        this.yawNode.setLocalPosition(0, FEET - k * 0.12, 0);
        this.body.setLocalEulerAngles(k * 22, 0, 0);
        this.head.setLocalEulerAngles(k * 25, 0, 0);
        const shrug = d.cause === 'trapped' ? Math.sin(Math.min(1, t / 0.6) * Math.PI) : 0;
        this.armL.setLocalEulerAngles(-shrug * 40, 0, 6 + shrug * 50);
        this.armR.setLocalEulerAngles(-10 - shrug * 40, 0, -6 - shrug * 50);
        this.legL.setLocalEulerAngles(-k * 70, 0, 0);
        this.legR.setLocalEulerAngles(-k * 70, 0, 0);
        this.eyes.setLocalScale(1, lerp(1, 0.15, k), 1);
        this.updateTransform();
      }
    }
  }
}
