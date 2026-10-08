// Renders the miner's portrait for the app icons (see tools/icon.html)
import * as pc from 'playcanvas';
import { Renderer } from '../src/render/renderer.js';
import { PlayerView } from '../src/render/player-view.js';
import { Mask } from '../src/render/masks.js';

const variant = new URLSearchParams(location.search).get('variant') || 'any';
document.getElementById('icon').className = variant;

const renderer = new Renderer(document.getElementById('c'), { alpha: true });
await renderer.init();
renderer.setQuality('low');
renderer.app.setCanvasFillMode(pc.FILLMODE_NONE);
renderer.app.resizeCanvas(1024, 1024);

const camera = renderer.cameraRig.entity;
camera.camera.clearColor = new pc.Color(0, 0, 0, 0);
camera.camera.fov = 26;

const player = new PlayerView(renderer.app, renderer.materials);
player.setMask(Mask.PLAYFIELD);
player.reset(4, -40);
player.yaw = player.targetYaw = 24;
player.blink = 99;
player.pick.enabled = false;

const zoom = variant === 'maskable' ? 1.32 : 1;
renderer.onFrame = dt => {
  player.update(Math.min(dt, 0.016));
  player.yaw = 24;
  player.blink = 99;
  // head and hard hat fill the frame
  const head = new pc.Vec3(player.x, player.y + 0.3, 0);
  camera.setPosition(head.x + 0.28 * zoom, head.y + 0.16 * zoom, 1.45 * zoom);
  camera.lookAt(head.x + 0.01, head.y - 0.01, 0);
  renderer.revealLight.light.intensity = 1.5;
  renderer.revealLight.setEulerAngles(28, 30, 0);
  renderer.app.scene.ambientLight = new pc.Color(0.42, 0.36, 0.32);
  renderer.lamp.setPosition(player.x - 0.5, player.y + 0.6, 1.4);
  renderer.lamp.light.intensity = 2.2;
};
window.__ready = true;
