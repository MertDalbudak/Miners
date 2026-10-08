/*
  World view - turns game events into animation, particles, light and camera
  movement.
*/

import * as pc from 'playcanvas';
import { GameConfig } from '../config.js';
import { B } from '../game/blocks.js';
import { BIOMES, biomeIndexAt } from '../game/biomes.js';
import { depthOfRow } from '../game/levelgen.js';
import { cellX, cellY, rowAtY } from './blocks-view.js';
import { PlayerView } from './player-view.js';
import { MonsterViews } from './monster-view.js';
import { Particles } from './particles.js';
import { Effects, sparkleColor } from './fx.js';
import { Surface } from './surface.js';
import { Mask } from './masks.js';
import { QUALITY } from './renderer.js';

const S = GameConfig.SURFACE_ROWS;

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class WorldView {
  constructor(renderer, hooks = {}) {
    this.r = renderer;
    this.app = renderer.app;
    this.hooks = hooks;
    this.surface = new Surface(this.app, renderer.materials, renderer.textures);
    this.player = new PlayerView(this.app, renderer.materials);
    this.monsters = new MonsterViews(this.app, renderer.materials);
    this.particles = new Particles(renderer.device, renderer.layer, renderer.materials);
    this.fx = new Effects(this.particles);
    this.boulders = new Map();
    this.boulderRoot = new pc.Entity('boulders');
    this.app.root.addChild(this.boulderRoot);
    this.mode = 'title';
    this.game = null;
    this.unsubs = [];
    this.time = 0;
    this.deathTime = 0;
    this.lastRemoved = null;
    this.ambientTimer = 0;
    this.lampOn = 1;
    this.extraReveal = 0;
    this.ambient = new pc.Color(0, 0, 0);
    this.createLights();
  }

  createLights() {
    this.flash = new pc.Entity('flash');
    this.flash.addComponent('light', {
      type: 'omni', color: new pc.Color(1, 0.7, 0.35), intensity: 0, range: 7,
      falloffMode: pc.LIGHTFALLOFF_LINEAR, castShadows: false, affectDynamic: true, affectLightmapped: true, bake: false
    });
    this.app.root.addChild(this.flash);
    this.flashLevel = 0;

    this.halo = new pc.Entity('lampHalo');
    const haloMi = new pc.MeshInstance(this.r.models.get('haloQuad'), this.r.materials.get('halo'), this.halo);
    haloMi.mask = Mask.PLAYFIELD;
    haloMi.drawOrder = 30;
    this.halo.addComponent('render', { meshInstances: [haloMi] });
    this.haloMi = haloMi;
    this.app.root.addChild(this.halo);

    this.magmaLights = [];
    for (let i = 0; i < 4; i++) {
      const e = new pc.Entity(`magma${i}`);
      e.addComponent('light', {
        type: 'omni', color: new pc.Color(1, 0.42, 0.12), intensity: 0, range: 2.1,
        falloffMode: pc.LIGHTFALLOFF_LINEAR, castShadows: false, affectDynamic: true, affectLightmapped: false, bake: false
      });
      e.enabled = false;
      this.app.root.addChild(e);
      this.magmaLights.push(e);
    }
  }

  setQuality(name) {
    this.particles.setQuality(QUALITY[name]?.particles ?? 1);
  }

  // ------------------------------------------------------------- game wiring

  setGame(game) {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.game = game;
    this.r.blocks.setGame(game);
    this.player.reset(game.player.c, game.player.r);
    this.monsters.clear();
    for (const b of this.boulders.values()) b.e.destroy();
    this.boulders.clear();
    this.particles.clear();
    this.lampOn = 1;
    this.extraReveal = 0;
    this.deathTime = 0;
    this.deathDone = false;
    this.flashLevel = 0;

    const on = (name, fn) => this.unsubs.push(game.on(name, fn.bind(this)));
    on('blockRemoved', this.onBlockRemoved);
    on('move', this.onMove);
    on('hit', this.onHit);
    on('bump', this.onBump);
    on('collect', this.onCollect);
    on('fall', e => this.player.onFall(e));
    on('fallStart', () => { this.player.state = 'falling'; });
    on('land', this.onLand);
    on('flare', this.onFlare);
    on('explosion', this.onExplosion);
    on('tntPrimed', e => this.fx.sparks(e.c, e.r, 0, 8, '#FFB347'));
    on('ignite', e => this.player.onSwing(e.dir, 'hit'));
    on('boulderWobble', e => this.r.blocks.wobble(e.c, e.r));
    on('boulderSettle', e => this.r.blocks.stopAnim(e.c, e.r));
    on('boulderDetach', this.onBoulderDetach);
    on('boulderFall', this.onBoulderFall);
    on('boulderLand', this.onBoulderLand);
    on('boulderShatter', this.onBoulderShatter);
    on('monsterSpawn', e => this.monsters.spawn(e.monster));
    on('monsterMove', e => this.monsters.get(e.monster).moveTo(e.to.c, e.to.r, e.duration));
    on('monsterDig', e => this.fx.dig(e.c, e.r, e.type, 0, 0.7));
    on('monsterAttack', e => this.monsters.get(e.monster).attack());
    on('monsterDie', this.onMonsterDie);
    on('monsterDespawn', e => this.monsters.remove(e.monster));
    on('shieldBreak', this.onShieldBreak);
    on('chest', e => this.fx.coins(e.c, e.r));
    on('death', this.onDeath);
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'dead') {
      this.deathTime = 0;
      this.deathDone = false;
    }
  }

  float(text, c, r, style = 'info') {
    if (this.hooks.float) {
      const p = this.r.cellToScreen(c, r);
      this.hooks.float(text, p.x, p.y, style);
    }
  }

  onBlockRemoved(e) {
    this.lastRemoved = e;
    this.r.blocks.pop(e.c, e.r, e.type, e.variant);
    if (e.reason === 'collect') this.fx.collect(e.c, e.r, e.type, e.variant);
    else this.fx.dig(e.c, e.r, e.type, e.variant, e.reason === 'break' ? 1.4 : 1);
    if (e.reason === 'break') {
      this.fx.sparks(e.c, e.r, 0, 10);
      this.r.cameraRig.addTrauma(0.12);
    }
  }

  onMove(e) {
    const dug = this.lastRemoved && this.lastRemoved.c === e.to.c && this.lastRemoved.r === e.to.r;
    this.lastRemoved = null;
    this.player.onMove(e, dug);
  }

  onHit(e) {
    const dx = e.dir === 'left' ? -1 : e.dir === 'right' ? 1 : 0;
    this.player.onSwing(e.dir, 'hit');
    this.r.blocks.shake(e.c, e.r, 1.2);
    this.fx.sparks(e.c, e.r, dx, 14);
    this.fx.dig(e.c, e.r, e.type, 0, 0.4);
    this.r.cameraRig.addTrauma(0.08);
  }

  onBump(e) {
    const dx = e.dir === 'left' ? -1 : e.dir === 'right' ? 1 : 0;
    const p = this.game.player;
    switch (e.reason) {
      case 'pickaxe':
        this.player.onSwing(e.dir, 'hit');
        this.r.blocks.shake(e.c, e.r, 0.5, 0.18);
        this.fx.sparks(e.c, e.r, dx, 6, '#E8E8E8');
        this.float('Need a pickaxe', p.c, p.r - 0.6, 'warn');
        break;
      case 'energy':
        this.player.onSwing(e.dir, 'bump');
        this.float('Too tired!', p.c, p.r - 0.6, 'danger');
        break;
      case 'flare':
        this.float('No flares', p.c, p.r - 0.6, 'warn');
        break;
      default:
        this.player.onSwing(e.dir, 'bump');
    }
  }

  onCollect(e) {
    if (e.energy) this.float(`+${e.energy}`, e.c, e.r - 0.15, 'energy');
    if (e.points) this.float(`+${e.points}`, e.c, e.r + 0.3, e.multiplier > 1 ? 'combo' : 'points');
    if (e.type === B.TORCH) {
      this.player.onCelebrate();
      this.fx.flareLaunch(cellX(e.c), cellY(e.r));
      this.flashLevel = Math.max(this.flashLevel, 0.6);
      this.flash.setPosition(cellX(e.c), cellY(e.r), 1.2);
    } else if (e.item) {
      this.player.onCelebrate();
    }
  }

  onLand(e) {
    this.player.onLand(e.steps);
    this.fx.land(this.player.x, cellY(e.r), e.r, e.steps > 2 ? 1.6 : 0.8);
    if (e.steps > 2) this.r.cameraRig.addTrauma(0.15);
  }

  onFlare() {
    this.fx.flareLaunch(this.player.x, this.player.y + 0.3);
    this.flashLevel = 1;
    this.flash.setPosition(this.player.x, this.player.y + 0.5, 1.2);
    this.player.onCelebrate();
  }

  onExplosion(e) {
    this.fx.explosion(e.c, e.r);
    for (const d of e.destroyed) {
      this.r.blocks.pop(d.c, d.r, d.type, d.variant);
      this.fx.dig(d.c, d.r, d.type, d.variant, 0.6);
    }
    this.flash.setPosition(cellX(e.c), cellY(e.r), 1.3);
    this.flashLevel = 1.8;
    this.extraReveal = Math.max(this.extraReveal, 0.35);
    this.r.cameraRig.addTrauma(0.75);
  }

  onBoulderDetach(e) {
    this.r.blocks.stopAnim(e.c, e.r);
    const entity = new pc.Entity(`boulder${e.id}`);
    const mi = new pc.MeshInstance(this.r.models.get(`boulder${e.id % 3}`), this.r.materials.get('boulder'), entity);
    mi.mask = Mask.PLAYFIELD;
    entity.addComponent('render', { meshInstances: [mi] });
    mi.mask = Mask.PLAYFIELD;
    entity.setPosition(cellX(e.c), cellY(e.r), 0);
    this.boulderRoot.addChild(entity);
    this.boulders.set(e.id, { e: entity, x: cellX(e.c), y: cellY(e.r), motion: null, spin: 0 });
    for (let i = 0; i < 3; i++) this.fx.trickle(e.c, e.r);
  }

  onBoulderFall(e) {
    const b = this.boulders.get(e.id);
    if (!b) return;
    b.motion = { fy: b.y, ty: cellY(e.r), t: 0, d: e.duration };
  }

  onBoulderLand(e) {
    const b = this.boulders.get(e.id);
    if (b) {
      b.e.destroy();
      this.boulders.delete(e.id);
    }
    this.fx.land(cellX(e.c), cellY(e.r), e.r, 1.5);
    this.r.blocks.shake(e.c, e.r, 0.6, 0.2);
    this.r.cameraRig.addTrauma(0.22);
  }

  onBoulderShatter(e) {
    const b = this.boulders.get(e.id);
    if (b) {
      b.e.destroy();
      this.boulders.delete(e.id);
    }
    this.fx.dig(e.c, e.r, B.BOULDER, 0, 1.6);
    this.r.cameraRig.addTrauma(0.3);
  }

  onMonsterDie(e) {
    const m = e.monster;
    this.monsters.remove(m, e.cause);
    this.fx.goo(m.c, m.r, m.kind === 'burrower' ? '#5E5577' : '#8A1F32');
    this.float(`+${GameConfig.MONSTER_POINTS}`, m.c, m.r, 'points');
  }

  onShieldBreak(e) {
    this.fx.shieldBreak(this.player.x, this.player.y);
    this.float('Hard hat saved you!', e.c, e.r - 0.8, 'good');
    this.r.cameraRig.addTrauma(0.4);
  }

  onDeath(e) {
    this.setMode('dead');
    const extra = { dir: this.player.facing };
    if (e.monster) {
      const model = this.monsters.models.get(e.monster.id);
      if (model) {
        extra.mx = model.x;
        extra.my = model.y;
        model.attack();
      }
    }
    this.player.die(e.cause, extra);
    if (e.cause === 'monster' || e.cause === 'crushed') this.r.cameraRig.addTrauma(0.45);
    this.deathStartLook = this.r.cameraRig.targetLook.clone();
    this.deathStartPos = this.r.cameraRig.targetPos.clone();
  }

  // ------------------------------------------------------------------ update

  update(dt) {
    this.time += dt;
    const game = this.game;
    if (!game) return;
    const rig = this.r.cameraRig;
    const p = game.player;

    this.player.update(dt);
    this.monsters.update(dt);
    this.updateBoulders(dt);
    this.surface.update(dt);

    // Miner lit by the sun only while above ground
    this.player.setMask(p.r < S && this.mode !== 'dead' ? Mask.PLAYER_SURFACE : Mask.PLAYFIELD);

    // ---- camera
    let reveal = game.revealLevel;
    let lambda = 6;
    if (this.mode === 'title') {
      rig.frameTitle(this.time);
      lambda = 2.5;
      this.titleIdle(dt);
    } else if (this.mode === 'play') {
      let top = game.pageTop;
      const playerRow = rowAtY(this.player.y);
      const compact = rig.compactRows();
      if (compact && reveal < 0.4 && game.player.r >= S) {
        // short screen: zoom in on the miner while it's dark
        top = Math.max(top - 1, Math.round(playerRow - compact * 0.38));
        rig.framePage(top, compact, this.player.x);
      } else {
        // follow the miner if a long fall drops them below the page
        if (playerRow > top + GameConfig.PAGE_ROWS - 2) top = playerRow - (GameConfig.PAGE_ROWS - 2);
        rig.framePage(top, GameConfig.PAGE_ROWS + 1, this.player.x);
      }
      lambda = 5;
    } else if (this.mode === 'dead') {
      this.deathTime += dt;
      const hold = 1.3;
      const pan = this.panDuration();
      // light up the mine so the player sees what happened
      reveal = Math.max(reveal, Math.min(1, this.deathTime * 0.9));
      if (this.deathTime < hold) {
        lambda = 3;
      } else {
        // fly back up the shaft, blending from the play framing to the title framing
        const k = Math.min(1, (this.deathTime - hold) / pan);
        const e = easeInOut(k);
        rig.frameTitle(this.time);
        rig.targetLook.lerp(this.deathStartLook, rig.targetLook, e);
        rig.targetPos.lerp(this.deathStartPos, rig.targetPos, e);
        lambda = k >= 1 ? 3 : 14;
        if (k >= 1 && !this.deathDone) {
          this.deathDone = true;
          if (this.hooks.onDeathSequenceDone) this.hooks.onDeathSequenceDone();
        }
      }
    }
    rig.update(dt, lambda);

    // ---- lights
    this.extraReveal = Math.max(0, this.extraReveal - dt);
    reveal = Math.max(reveal, this.extraReveal);
    this.r.revealLight.light.intensity = reveal * 1.35;
    this.app.scene.ambientLight = this.ambient.set(0.16 * reveal, 0.17 * reveal, 0.21 * reveal);

    const lamp = this.r.lamp;
    lamp.setPosition(this.player.x, this.player.y + 0.28, 1.15);
    let lampIntensity = 4.4;
    if (this.mode === 'dead') {
      const fading = game.deathCause === 'exhausted' || game.deathCause === 'trapped';
      this.lampOn = Math.max(0, this.lampOn - dt * (fading ? 0.8 : 6));
    } else {
      this.lampOn = 1;
      if (p.energy <= GameConfig.LOW_ENERGY && p.r >= S) {
        const n = Math.sin(this.time * 31) * Math.sin(this.time * 7.3);
        lampIntensity *= 0.78 + 0.22 * n;
      }
    }
    lamp.light.intensity = lampIntensity * this.lampOn;
    lamp.light.range = this.r.lampRange;

    // soft glow around the headlamp, strongest in the dark
    const lens = this.player.headWorld;
    const glow = (lampIntensity / 4.4) * this.lampOn * (1 - reveal * 0.75) * (this.player.root.enabled ? 1 : 0);
    this.halo.enabled = glow > 0.02;
    this.halo.setPosition(lens.x, lens.y, lens.z + 0.08);
    this.halo.setLocalScale(0.42, 0.42, 0.42);
    this.haloMi.setParameter('material_emissiveIntensity', glow * 0.4);

    this.flashLevel = Math.max(0, this.flashLevel - dt * 2.2);
    this.flash.light.intensity = this.flashLevel * 5;
    this.flash.light.range = 5 + this.flashLevel * 3;
    this.flash.enabled = this.flashLevel > 0.01;

    this.updateMagmaLights();

    // ---- visible blocks
    const [top, bottom] = rig.visibleRows();
    this.r.blocks.update(dt, Math.max(S, top), bottom);
    this.r.walls.update(this.time, rig.look.y);

    // ---- ambience
    this.updateAmbient(dt, top, bottom);
    this.particles.update(dt, rig.entity);
  }

  // The miner keeps busy on the title screen
  titleIdle(dt) {
    this.idleTimer = (this.idleTimer ?? 3) - dt;
    if (this.idleTimer > 0 || this.player.action) return;
    this.idleTimer = 4 + Math.random() * 4;
    const roll = Math.random();
    if (roll < 0.35) {
      this.player.onCelebrate();
    } else if (roll < 0.75) {
      const dir = Math.random() < 0.5 ? 'left' : 'right';
      this.player.onSwing(dir, 'hit');
      setTimeout(() => {
        if (this.mode === 'title') this.player.targetYaw = this.player.facing * 25;
      }, 400);
    } else {
      this.player.setFacing(Math.random() < 0.5 ? 'left' : 'right');
    }
  }

  panDuration() {
    const depth = this.game ? this.game.maxDepth : 0;
    return Math.min(4.5, 1.6 + depth * 0.025);
  }

  updateBoulders(dt) {
    for (const b of this.boulders.values()) {
      if (b.motion) {
        const m = b.motion;
        m.t += dt;
        const k = Math.min(1, m.t / m.d);
        b.y = m.fy + (m.ty - m.fy) * k * k;
        b.spin += dt * 120;
        if (k >= 1) b.motion = null;
      }
      b.e.setPosition(b.x, b.y, 0);
      b.e.setEulerAngles(0, 0, b.spin);
    }
  }

  updateMagmaLights() {
    const game = this.game;
    const p = game.player;
    const found = [];
    for (let r = p.r - 7; r <= p.r + 9; r++) {
      const row = game.grid.rows.get(r);
      if (!row) continue;
      for (let c = 0; c < GameConfig.COLS; c++) {
        if (row.type[c] === B.MAGMA) found.push({ c, r, d: Math.abs(c - p.c) + Math.abs(r - p.r) });
      }
    }
    found.sort((a, b) => a.d - b.d);
    this.magmaLights.forEach((e, i) => {
      const m = found[i];
      if (!m) {
        e.enabled = false;
        return;
      }
      e.enabled = true;
      e.setPosition(cellX(m.c), cellY(m.r), 0.9);
      e.light.intensity = 1.6 + Math.sin(this.time * 3 + m.c * 1.7 + m.r) * 0.3;
    });
  }

  updateAmbient(dt, top, bottom) {
    const game = this.game;
    if (!game || this.mode === 'title') return;
    this.ambientTimer -= dt;
    const depth = depthOfRow(rowAtY(this.player.y));
    if (this.ambientTimer <= 0 && game.player.r >= S) {
      this.ambientTimer = 0.18;
      this.fx.ambient('dust', this.player.x, this.player.y);
      const kind = BIOMES[biomeIndexAt(depth)].particle;
      if (kind !== 'dust') this.fx.ambient(kind, this.r.cameraRig.look.x, this.r.cameraRig.look.y);
    }

    // Rare gems twinkle in the dark
    const grid = game.grid;
    for (let r = Math.max(S, top); r <= bottom; r++) {
      const row = grid.rows.get(r);
      if (!row) continue;
      for (let c = 0; c < GameConfig.COLS; c++) {
        const t = row.type[c];
        if ((t === B.DIAMOND || t === B.GEM) && Math.random() < dt * 0.7) {
          this.fx.glint(cellX(c), cellY(r), sparkleColor(t, row.variant[c]));
        }
      }
    }
  }
}
