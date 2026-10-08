/*
  Camera rig - frames the current "page" of the mine, follows the miner when
  needed, and adds screen shake.
*/

import * as pc from 'playcanvas';
import { GameConfig } from '../config.js';
import { cellY } from './blocks-view.js';

const SHAFT_WIDTH = GameConfig.COLS + 0.9;

function damp(current, target, lambda, dt) {
  return target + (current - target) * Math.exp(-lambda * dt);
}

export class CameraRig {
  constructor(app) {
    this.app = app;
    this.entity = new pc.Entity('camera');
    this.entity.addComponent('camera', {
      clearColor: new pc.Color(0.02, 0.012, 0.008),
      fov: 32,
      nearClip: 0.3,
      farClip: 400
    });
    app.root.addChild(this.entity);
    this.camera = this.entity.camera;

    this.pos = new pc.Vec3(0, 3, 30);
    this.look = new pc.Vec3(0, 0, 0);
    this.targetPos = this.pos.clone();
    this.targetLook = this.look.clone();
    this.mode = 'title';
    this.trauma = 0;
    this.shakeEnabled = true;
    this.time = 0;
    this.insets = { top: 70, bottom: 20 };
    this.pitch = 9;
    this.sway = 0;
  }

  setInsets(top, bottom) {
    this.insets.top = top;
    this.insets.bottom = bottom;
  }

  get aspect() {
    const device = this.app.graphicsDevice;
    return device.width / Math.max(1, device.height);
  }

  // On short screens a whole page would make cells tiny. Returns how many rows
  // fit at a comfortable size, or 0 when the full page is fine.
  compactRows(rows = GameConfig.PAGE_ROWS + 1) {
    const device = this.app.graphicsDevice;
    const screenH = device.clientRect.height || device.height;
    const screenW = device.clientRect.width || device.width;
    const safeH = screenH - Math.min(this.insets.top, screenH * 0.3) - Math.min(this.insets.bottom, screenH * 0.35);
    const cellByHeight = safeH / rows;
    const cellByWidth = screenW / SHAFT_WIDTH;
    if (Math.min(cellByHeight, cellByWidth) >= 30 || cellByWidth < 30) return 0;
    return Math.max(7, Math.floor(safeH / 36));
  }

  // Distance and center needed to show `rows` rows starting at `topRow`
  framePage(topRow, rows = GameConfig.PAGE_ROWS + 1, focusX = 0) {
    const device = this.app.graphicsDevice;
    const screenH = device.clientRect.height || device.height;
    const safeTop = Math.min(this.insets.top, screenH * 0.3);
    const safeBottom = Math.min(this.insets.bottom, screenH * 0.35);
    const safeFrac = Math.max(0.4, (screenH - safeTop - safeBottom) / screenH);
    const tanHalf = Math.tan((this.camera.fov * Math.PI) / 360);

    const needH = rows / safeFrac;
    const distH = needH / (2 * tanHalf);
    const distW = SHAFT_WIDTH / (2 * tanHalf * this.aspect);
    const dist = Math.max(distH, distW);

    // Center of the page in world space, shifted so it lands in the safe area
    const pageCenterY = cellY(topRow) + 0.5 - rows / 2;
    const visibleH = 2 * dist * tanHalf;
    const offsetY = ((safeTop - safeBottom) / 2 / screenH) * visibleH;
    const centerY = pageCenterY + offsetY;

    const pitch = (this.pitch * Math.PI) / 180;
    const x = focusX * 0.12;
    this.targetLook.set(x, centerY, 0);
    this.targetPos.set(x, centerY + Math.sin(pitch) * dist, Math.cos(pitch) * dist);
    return { dist, rows: visibleH };
  }

  // The mining camp, framed around the menu layout of the screen shape
  frameTitle(time) {
    const sway = Math.sin(time * 0.12);
    const tanHalf = Math.tan((this.camera.fov * Math.PI) / 360);
    const aspect = this.aspect;
    const width = this.app.graphicsDevice.clientRect.width || this.app.graphicsDevice.width;
    const wide = aspect > 1.25 && width >= 900;
    let dist;
    if (wide) {
      dist = 19;
      this.targetLook.set(-3.4 + sway * 0.4, 1.9, -3.5);
    } else {
      // keep the headframe and the miner in view on narrow screens
      dist = Math.max(17, 11.5 / (2 * tanHalf * aspect));
      this.targetLook.set(sway * 0.3, aspect < 0.8 ? 0.9 : 1.6, -3);
    }
    const dx = 0.13 + sway * 0.05;
    const dy = 0.06;
    const len = Math.hypot(dx, dy, 1);
    this.targetPos.set(
      this.targetLook.x + (dx / len) * dist,
      this.targetLook.y + (dy / len) * dist,
      this.targetLook.z + (1 / len) * dist
    );
  }

  snap() {
    this.pos.copy(this.targetPos);
    this.look.copy(this.targetLook);
  }

  addTrauma(amount) {
    if (!this.shakeEnabled) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  // Visible row range at the playfield plane (z = 0)
  visibleRows() {
    const tanHalf = Math.tan((this.camera.fov * Math.PI) / 360);
    const dist = this.pos.distance(this.look);
    const half = dist * tanHalf * 1.15 + 1.5;
    const top = GameConfig.SURFACE_ROWS - 0.5 - (this.look.y + half);
    const bottom = GameConfig.SURFACE_ROWS - 0.5 - (this.look.y - half);
    return [Math.floor(top), Math.ceil(bottom)];
  }

  update(dt, lambda = 6) {
    this.time += dt;
    this.pos.x = damp(this.pos.x, this.targetPos.x, lambda, dt);
    this.pos.y = damp(this.pos.y, this.targetPos.y, lambda, dt);
    this.pos.z = damp(this.pos.z, this.targetPos.z, lambda, dt);
    this.look.x = damp(this.look.x, this.targetLook.x, lambda, dt);
    this.look.y = damp(this.look.y, this.targetLook.y, lambda, dt);
    this.look.z = damp(this.look.z, this.targetLook.z, lambda, dt);

    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const shake = this.trauma * this.trauma;
    const t = this.time * 40;
    const sx = shake * 0.35 * (Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5);
    const sy = shake * 0.35 * (Math.cos(t * 1.3) + Math.sin(t * 2.9) * 0.5);

    this.entity.setPosition(this.pos.x + sx, this.pos.y + sy, this.pos.z);
    this.entity.lookAt(this.look.x + sx * 0.5, this.look.y + sy * 0.5, this.look.z);
    if (shake > 0) this.entity.rotateLocal(0, 0, shake * 4 * Math.sin(t * 0.9));
  }
}
