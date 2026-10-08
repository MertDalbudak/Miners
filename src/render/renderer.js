/*
  Renderer - owns the PlayCanvas application and every visual system.
*/

import * as pc from 'playcanvas';
import { TextureLibrary } from './textures.js';
import { MaterialLibrary } from './materials.js';
import { ModelLibrary } from './models.js';
import { BlocksView, cellX, cellY } from './blocks-view.js';
import { WallsView } from './walls-view.js';
import { CameraRig } from './camera-rig.js';
import { LightMask } from './masks.js';
import { GameConfig } from '../config.js';

export const QUALITY = {
  low: { pixelRatio: 1, post: false, bloom: 0, particles: 0.5, lanterns: 2, msaa: 1 },
  medium: { pixelRatio: 1.5, post: true, bloom: 0.006, particles: 0.8, lanterns: 3, msaa: 1 },
  high: { pixelRatio: 2, post: true, bloom: 0.008, particles: 1, lanterns: 4, msaa: 4 }
};

export class Renderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = options;
    this.app = null;
    this.time = 0;
    this.quality = 'high';
    this.reveal = 0;
    this.onFrame = null;
  }

  async init(onProgress = () => {}) {
    const device = await pc.createGraphicsDevice(this.canvas, {
      deviceTypes: [pc.DEVICETYPE_WEBGL2],
      antialias: true,
      alpha: !!this.options.alpha,
      powerPreference: 'high-performance'
    });
    this.device = device;

    const options = new pc.AppOptions();
    options.graphicsDevice = device;
    options.componentSystems = [pc.RenderComponentSystem, pc.CameraComponentSystem, pc.LightComponentSystem];
    options.resourceHandlers = [pc.TextureHandler];
    const app = new pc.AppBase(this.canvas);
    app.init(options);
    app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.app = app;

    const scene = app.scene;
    scene.ambientLight = new pc.Color(0, 0, 0);
    scene.clusteredLightingEnabled = true;
    const lighting = scene.lighting;
    lighting.shadowsEnabled = false;
    lighting.cookiesEnabled = false;
    lighting.areaLightsEnabled = false;
    lighting.maxLightsPerCell = 12;
    lighting.cells = new pc.Vec3(12, 16, 4);

    this.layer = scene.layers.getLayerByName('World');

    this.textures = new TextureLibrary(device);
    await this.textures.generateAll(p => onProgress(p * 0.8));
    this.materials = new MaterialLibrary(this.textures);
    onProgress(0.85);
    this.models = new ModelLibrary(device);
    onProgress(0.9);

    this.cameraRig = new CameraRig(app);
    this.blocks = new BlocksView(device, this.layer, this.materials, this.models);
    this.walls = new WallsView(app, this.materials, this.models);
    this.createLights();
    onProgress(1);

    window.addEventListener('resize', () => this.resize());
    this.resize();

    app.on('update', dt => this.update(dt));
    app.start();
  }

  createLights() {
    const app = this.app;

    // Miner's headlamp: lights the playfield and the side walls
    this.lamp = new pc.Entity('lamp');
    this.lamp.addComponent('light', {
      type: 'omni',
      color: new pc.Color(1, 0.86, 0.66),
      intensity: 3.6,
      range: GameConfig.LAMP_RANGE,
      falloffMode: pc.LIGHTFALLOFF_LINEAR,
      castShadows: false,
      affectDynamic: true,
      affectLightmapped: true,
      bake: false
    });
    app.root.addChild(this.lamp);
    this.lampRange = GameConfig.LAMP_RANGE;

    // Torch / flare reveal: lights everything in the shaft
    this.revealLight = new pc.Entity('reveal');
    this.revealLight.addComponent('light', {
      type: 'directional',
      color: new pc.Color(1, 0.93, 0.82),
      intensity: 0,
      castShadows: false
    });
    this.revealLight.light.mask = LightMask.REVEAL;
    this.revealLight.setEulerAngles(35, 18, 0);
    app.root.addChild(this.revealLight);

    // Sun and sky fill for the surface
    this.sun = new pc.Entity('sun');
    this.sun.addComponent('light', {
      type: 'directional',
      color: new pc.Color(1, 0.95, 0.85),
      intensity: 1.7,
      castShadows: false
    });
    this.sun.light.mask = LightMask.SUN;
    this.sun.setEulerAngles(50, 35, 0);
    app.root.addChild(this.sun);

    this.skyFill = new pc.Entity('skyFill');
    this.skyFill.addComponent('light', {
      type: 'directional',
      color: new pc.Color(0.62, 0.75, 1),
      intensity: 0.55,
      castShadows: false
    });
    this.skyFill.light.mask = LightMask.SUN;
    this.skyFill.setEulerAngles(-60, -30, 0);
    app.root.addChild(this.skyFill);
  }

  setQuality(name) {
    this.quality = QUALITY[name] ? name : 'high';
    const q = QUALITY[this.quality];
    this.device.maxPixelRatio = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    this.setupPost(q);
    this.resize();
  }

  setupPost(q) {
    const cam = this.cameraRig.camera;
    if (q.post) {
      if (!this.cameraFrame) {
        this.cameraFrame = new pc.CameraFrame(this.app, cam);
      }
      const cf = this.cameraFrame;
      cf.enabled = true;
      cf.rendering.toneMapping = pc.TONEMAP_ACES;
      cf.rendering.samples = q.msaa;
      cf.rendering.renderTargetScale = 1;
      cf.bloom.intensity = q.bloom;
      cf.bloom.blurLevel = 7;
      cf.vignette.intensity = 0.35;
      cf.vignette.inner = 0.45;
      cf.vignette.outer = 1.1;
      cf.vignette.curvature = 0.6;
      cf.update();
    } else {
      if (this.cameraFrame) this.cameraFrame.enabled = false;
      cam.toneMapping = pc.TONEMAP_ACES;
      cam.gammaCorrection = pc.GAMMA_SRGB;
    }
  }

  resize() {
    if (!this.app) return;
    this.app.resizeCanvas();
  }

  setLampLevel(level) {
    this.lampRange = GameConfig.LAMP_RANGE + level * GameConfig.LAMP_RANGE_PER_LEVEL;
  }

  worldToScreen(x, y, z, out = new pc.Vec3()) {
    return this.cameraRig.camera.worldToScreen(new pc.Vec3(x, y, z), out);
  }

  cellToScreen(c, r, out) {
    return this.worldToScreen(cellX(c), cellY(r), 0.5, out);
  }

  update(dt) {
    this.time += dt;
    if (this.onFrame) this.onFrame(dt);
  }
}
