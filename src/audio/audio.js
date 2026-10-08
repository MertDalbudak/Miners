/*
  Audio engine: original sound files + procedural effects + generative music.
  The AudioContext is unlocked on the first user gesture (required on mobile).
*/

import { generateSfx } from './synth.js';
import { Music } from './music.js';

const FILES = {
  dirt_hit: 'sounds/dirt_hit.mp3',
  gold_hit: 'sounds/gold_hit.mp3',
  tnt_hit: 'sounds/tnt_hit.mp3',
  torch_pickup: 'sounds/torch_pickup.mp3',
  pickaxe_pickup: 'sounds/pickaxe_pickup.mp3'
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.volumes = { master: 0.8, sfx: 0.8, music: 0.5, muted: false };
    this.lastPlay = {};
    this.musicWanted = false;
    this.unlocked = false;
    this.paused = false;
  }

  init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch (e) {
      return false;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -12;
    this.compressor.ratio.value = 4;
    this.master.connect(this.compressor);
    this.compressor.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.music = new Music(ctx, this.musicBus);
    this.applyVolumes();
    Object.assign(this.buffers, generateSfx(ctx));

    const unlock = () => {
      if (ctx.state === 'suspended' && !this.paused) ctx.resume();
      if (ctx.state === 'running') {
        this.unlocked = true;
        if (this.musicWanted) this.music.start();
        for (const ev of ['pointerdown', 'keydown', 'touchend']) window.removeEventListener(ev, unlock, true);
      }
    };
    for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, true);
    return true;
  }

  async loadFiles() {
    if (!this.ctx) return;
    await Promise.all(Object.entries(FILES).map(async ([name, url]) => {
      try {
        const res = await fetch(url);
        const data = await res.arrayBuffer();
        this.buffers[name] = await new Promise((resolve, reject) => this.ctx.decodeAudioData(data, resolve, reject));
      } catch (e) {
        // missing sound files are not fatal
      }
    }));
  }

  setVolumes(v) {
    Object.assign(this.volumes, v);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const v = this.volumes;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(v.muted ? 0 : v.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(v.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(v.music * 0.55, t, 0.05);
  }

  play(name, { volume = 1, rate = 1, vary = 0.04, pan = 0, minGap = 0.03 } = {}) {
    const ctx = this.ctx;
    const buffer = this.buffers[name];
    if (!ctx || !buffer || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (this.lastPlay[name] && now - this.lastPlay[name] < minGap) return;
    this.lastPlay[name] = now;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * vary);
    const g = ctx.createGain();
    g.gain.value = volume;
    let node = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      node = p;
    }
    src.connect(g);
    node.connect(this.sfxBus);
    src.start();
  }

  startMusic() {
    this.musicWanted = true;
    if (this.ctx && this.ctx.state === 'running') this.music.start();
  }

  stopMusic() {
    this.musicWanted = false;
    if (this.music) this.music.stop();
  }

  setMusicStyle(style) {
    if (this.music) this.music.setStyle(style);
  }

  setIntensity(v) {
    if (this.music) this.music.setIntensity(v);
  }

  suspend() {
    this.paused = true;
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    this.paused = false;
    if (this.ctx && this.ctx.state === 'suspended' && this.unlocked) this.ctx.resume();
  }
}
