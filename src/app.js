/*
  App - wires the game rules, 3D view, audio, input and UI together and runs
  the lifecycle: title -> playing -> (paused) -> dying -> results.
*/

import { Renderer } from './render/renderer.js';
import { WorldView } from './render/world-view.js';
import { Game } from './game/game.js';
import { Profile } from './game/profile.js';
import { AudioEngine } from './audio/audio.js';
import { Ads } from './ads/ads.js';
import { UI } from './ui/ui.js';
import { Input } from './ui/input.js';
import { dailySeed } from './core/rng.js';
import { GameConfig } from './config.js';
import { B, GEM_VARIANTS } from './game/blocks.js';
import { BIOMES } from './game/biomes.js';

const S = GameConfig.SURFACE_ROWS;
const MENU_MUSIC = { root: 60, scale: 'major', tempo: 70 };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const ORE_SOUND_RATE = { [B.COAL]: 0.85, [B.IRON]: 1, [B.GOLD]: 1.12, [B.DIAMOND]: 1.25, [B.GEM]: 1.4 };

export class App {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.profile = new Profile();
    this.settings = this.profile.settings;
    this.audio = new AudioEngine();
    this.ads = new Ads({ onAdStart: () => this.onAdStart(), onAdEnd: () => this.onAdEnd() });
    this.finishedRuns = 0;
    this.adBusy = false;
    this.rewardOffer = null;
    this.ui = new UI(this);
    this.state = 'loading';
    this.game = null;
    this.mode = 'normal';
    this.unsubs = [];
    this.autoQuality = null;
    this.perf = { time: 0, frames: 0 };
    this.achievementCheck = 0;
    this.runAchievements = [];
    this.resultsShown = false;
    this.keyHintTimer = 0;
    this.saveTimer = null;
  }

  // ------------------------------------------------------------------- boot

  async boot() {
    this.ui.setLoading(0.03, 'Preparing the mine…');
    this.audio.init();
    this.ads.init();
    this.applyAudioSettings();
    try {
      await Promise.race([document.fonts.load('40px "Lilita One"'), wait(2000)]);
    } catch (e) {
      // fonts are optional
    }

    this.renderer = new Renderer(this.canvas);
    try {
      await this.renderer.init(p => this.ui.setLoading(0.05 + p * 0.85, p < 0.75 ? 'Painting the rocks…' : 'Building the camp…'));
    } catch (e) {
      console.error(e);
      this.ui.fatal();
      return;
    }

    this.world = new WorldView(this.renderer, {
      float: (text, x, y, style) => this.ui.float(text, x, y, style),
      onDeathSequenceDone: () => this.showResults()
    });
    this.applyGraphicsSettings();

    this.input = new Input({
      canvas: this.canvas,
      isPlaying: () => this.state === 'playing',
      onAction: action => this.onAction(action),
      onPause: () => this.pause(),
      onMute: () => this.toggleMute(),
      onBack: () => this.onBack(),
      onConfirm: () => this.onConfirm(),
      onAnyKey: () => this.skipDeath(),
      onCanvasTap: () => this.skipDeath(),
      navigate: (dir, active) => this.ui.navigate(dir, active),
      tapAction: (x, y) => this.tapAction(x, y)
    });

    this.audio.loadFiles();
    this.ui.renderHowTo(this.isTouch());
    this.ui.renderAbout({ ads: this.ads.enabled, privacyUrl: import.meta.env.VITE_PRIVACY_URL || '' });
    this.newGame('normal');
    this.goToTitle(true);

    this.renderer.onFrame = dt => this.frame(dt);
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('orientationchange', () => setTimeout(() => this.layout(), 200));
    document.addEventListener('visibilitychange', () => this.onVisibility());
    this.layout();

    this.ui.setLoading(1, 'Ready!');
    this.ui.hideLoading();
  }

  isTouch() {
    return (window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;
  }

  caps() {
    return {
      privacyChoices: this.ads.hasPrivacyOptions,
      vibrate: typeof navigator.vibrate === 'function',
      fullscreen: !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)
    };
  }

  // ------------------------------------------------------------- settings

  applyAudioSettings() {
    const s = this.settings;
    this.audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx, muted: s.muted });
  }

  detectQuality() {
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    const lowMemory = navigator.deviceMemory && navigator.deviceMemory < 4;
    if (lowMemory) return 'low';
    if (this.isTouch() || small) return 'medium';
    return 'high';
  }

  currentQuality() {
    if (this.settings.quality !== 'auto') return this.settings.quality;
    return this.autoQuality || this.detectQuality();
  }

  applyGraphicsSettings() {
    const q = this.currentQuality();
    this.renderer.setQuality(q);
    this.world.setQuality(q);
    this.renderer.cameraRig.shakeEnabled = this.settings.shake;
  }

  saveSettingsSoon() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.profile.saveSettings(), 300);
  }

  onSettingChange(key, value) {
    if (key === 'name') {
      this.profile.data.name = value;
      this.profile.save();
      return;
    }
    this.settings[key] = value;
    if (key === 'master' || key === 'music' || key === 'sfx') {
      this.applyAudioSettings();
      if (key !== 'music') this.audio.play('pluck', { minGap: 0.12 });
    }
    this.saveSettingsSoon();
  }

  toggleMute() {
    this.settings.muted = !this.settings.muted;
    this.applyAudioSettings();
    this.profile.saveSettings();
    this.ui.toast(this.settings.muted ? 'Sound off' : 'Sound on', 'Press M to toggle', this.settings.muted ? 'mute' : 'sound');
  }

  updateTouchVisibility() {
    const pref = this.settings.touchControls;
    const visible = pref === 'on' || (pref === 'auto' && this.isTouch());
    this.ui.setTouchVisible(visible);
    this.layout();
  }

  haptic(pattern) {
    if (this.settings.haptics && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // ignore
      }
    }
  }

  // Keep the playfield clear of the HUD and on-screen buttons
  layout() {
    if (!this.renderer) return;
    this.renderer.resize();
    const hudBottom = Math.max(
      document.querySelector('.hud-left').getBoundingClientRect().bottom,
      document.querySelector('.hud-right').getBoundingClientRect().bottom
    );
    const landscape = window.innerWidth > window.innerHeight * 1.15;
    let top = hudBottom + 26;
    let bottom = 16;
    if (landscape) {
      // HUD panels and buttons sit in the corners, only the pause button is above the shaft
      const pause = document.querySelector('.hud-pause').getBoundingClientRect();
      top = pause.bottom + 8;
      bottom = document.body.classList.contains('touch-on') ? 10 : 56;
    } else if (document.body.classList.contains('touch-on')) {
      const pad = document.querySelector('.touch-pad').getBoundingClientRect();
      if (pad.height > 0) bottom = window.innerHeight - pad.top + 6;
    }
    this.renderer.cameraRig.setInsets(top, bottom);
  }

  // -------------------------------------------------------------- lifecycle

  newGame(mode) {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.mode = mode;
    const seed = mode === 'daily' ? dailySeed() : undefined;
    this.game = new Game({ mode, seed, upgrades: this.profile.upgrades });
    this.world.setGame(this.game);
    this.renderer.setLampLevel(this.profile.level('lamp'));
    this.bindGame(this.game);
    this.ui.setEnergy(this.game.player.energy);
    this.ui.setItems(this.game.itemState());
    this.ui.setScore(0);
    this.ui.setDepth(0);
    this.ui.setCombo(1);
    this.runAchievements = [];
    this.resultsShown = false;
  }

  goToTitle(first = false) {
    if (!first && (!this.game || this.game.state !== 'ready' || this.game.mode !== 'normal')) this.newGame('normal');
    this.state = 'title';
    this.world.setMode('title');
    this.ui.renderTitle(this.profile);
    this.ui.setScreen('title');
    this.ui.setSkipHint(false);
    this.ui.clearHints();
    this.audio.setMusicStyle(MENU_MUSIC);
    this.audio.setIntensity(0.12);
    this.audio.startMusic();
  }

  startRun(mode = 'normal') {
    if (!this.game || this.game.state !== 'ready' || this.game.mode !== mode) this.newGame(mode);
    this.ui.clearFloaters();
    this.ui.clearHints();
    this.game.start();
    this.state = 'playing';
    this.world.setMode('play');
    this.ui.setScreen('game');
    this.updateTouchVisibility();
    this.audio.setMusicStyle(BIOMES[0].music);
    this.audio.setIntensity(0.25);
    this.audio.startMusic();
    this.runMoves = 0;
    if (!this.isTouch()) {
      this.ui.setKeyHints(true);
      this.keyHintTimer = 9;
    }
    if (mode === 'daily') this.ui.banner('Daily Dig', 'Same mine all day - beat your best!');
    this.tip('start', this.isTouch()
      ? 'Swipe or use the arrows to dig. Memorize the mine - it gets dark below!'
      : 'Dig with ← ↓ →. Memorize the mine - it gets dark below!', 6);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.releaseAll();
    this.ui.renderPause(this.game);
    this.ui.setScreen('pause');
    this.audio.setIntensity(0.05);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.setScreen('game');
    this.layout();
  }

  // Leaving a run early still keeps its coins, score and stats
  bankAbandonedRun() {
    const game = this.game;
    if (!game || game.state !== 'playing' || game.moves === 0) return;
    game.deathCause = 'quit';
    const results = game.getResults();
    const summary = this.profile.recordRun(results);
    const coins = results.coins.total + summary.unlocked.reduce((sum, a) => sum + a.coins, 0) +
      this.runAchievements.reduce((sum, a) => sum + a.coins, 0);
    if (coins > 0) this.ui.toast('Run saved', `+${coins} coins banked`, 'coin');
    this.finishedRuns++;
  }

  // ------------------------------------------------------------------ ads

  // Starts a run, after an interstitial if Google has one due. Never before
  // the first run of a session, and never in the middle of a run.
  async startAfterAd(type, name, start) {
    if (this.adBusy) return;
    this.adBusy = true;
    try {
      if (this.finishedRuns > 0) await this.ads.interstitial(type, name);
    } finally {
      this.adBusy = false;
    }
    start();
  }

  // Results screen: watch a rewarded ad to double the coins of this run
  offerDoubleCoins(results) {
    const coins = results.coins.total;
    if (!this.ads.available || coins < 5) return;
    const offer = { coins, show: null, granted: false };
    this.rewardOffer = offer;
    this.ads.reward('double-coins', {
      onOffer: show => {
        if (this.rewardOffer !== offer || this.state !== 'over') return;
        offer.show = show;
        this.ui.showRewardOffer(coins);
      },
      onReward: () => {
        if (offer.granted) return;
        offer.granted = true;
        this.profile.data.coins += coins;
        this.profile.save();
      }
    }).then(() => {
      if (this.rewardOffer !== offer) return;
      offer.show = null;
      this.ui.hideRewardOffer();
      if (offer.granted && this.state === 'over') {
        this.ui.markCoinsDoubled(coins);
        this.ui.toast('Coins doubled!', `+${coins} coins`, 'coin');
        this.audio.play('chest');
      }
    });
  }

  watchRewardAd() {
    const offer = this.rewardOffer;
    if (!offer || !offer.show) return;
    const show = offer.show;
    offer.show = null;
    this.ui.setRewardBusy();
    show();
  }

  onAdStart() {
    if (this.state === 'playing') this.pause();
    this.input.releaseAll();
    this.audio.suspend();
  }

  onAdEnd() {
    if (!document.hidden) this.audio.resume();
  }

  renameScore(rank, name) {
    const entry = this.profile.data.scores[rank - 1];
    if (entry) entry.name = name;
    this.profile.data.name = name;
    this.profile.save();
  }

  onDeath(e) {
    this.state = 'dying';
    this.input.releaseAll();
    this.ui.setScreen('dying');
    this.ui.setKeyHints(false);
    this.ui.clearHints();
    this.deathAt = performance.now();
    setTimeout(() => {
      if (this.state === 'dying') this.ui.setSkipHint(true, this.isTouch() ? 'Tap to continue' : 'Click or press any key');
    }, 1200);
    this.audio.stopMusic();
    setTimeout(() => this.audio.play('game_over'), e.cause === 'tnt' ? 700 : 350);
    this.haptic(e.cause === 'tnt' ? [90, 50, 160] : [120]);
  }

  skipDeath() {
    if (this.state === 'dying' && performance.now() - this.deathAt > 900) this.showResults();
  }

  showResults() {
    if (this.resultsShown || !this.game) return;
    this.resultsShown = true;
    const results = this.game.getResults();
    const summary = this.profile.recordRun(results);
    summary.unlocked = [...this.runAchievements, ...summary.unlocked];
    summary.achievementCoins = summary.unlocked.reduce((sum, a) => sum + a.coins, 0);
    this.state = 'over';
    this.ui.setSkipHint(false);
    this.ui.renderGameOver(results, summary, this.profile);
    this.ui.setScreen('over');
    this.finishedRuns++;
    this.offerDoubleCoins(results);
    if (summary.unlocked.length) setTimeout(() => this.audio.play('achievement'), 500);
    this.audio.setMusicStyle(MENU_MUSIC);
    this.audio.setIntensity(0.1);
    this.audio.startMusic();
  }

  // ----------------------------------------------------------------- input

  onAction(action) {
    if (this.state !== 'playing') return;
    this.game.act(action);
  }

  onBack() {
    if (this.state === 'paused' && this.ui.current === 'pause') {
      this.resume();
      return;
    }
    if (this.state === 'dying') {
      this.skipDeath();
      return;
    }
    if (this.ui.current !== 'title' && this.ui.current !== 'over' && this.ui.back()) {
      this.audio.play('back');
      if (this.ui.current === 'title') this.ui.renderTitle(this.profile);
    }
  }

  onConfirm() {
    if (this.state === 'dying') this.skipDeath();
    else this.ui.confirm();
  }

  tapAction(x, y) {
    if (!this.game || this.state !== 'playing') return null;
    const cam = this.renderer.cameraRig.camera;
    const a = cam.screenToWorld(x, y, cam.nearClip);
    const b = cam.screenToWorld(x, y, cam.farClip);
    const t = (0.5 - a.z) / (b.z - a.z);
    if (!Number.isFinite(t)) return null;
    const wx = a.x + (b.x - a.x) * t;
    const wy = a.y + (b.y - a.y) * t;
    const c = Math.round(wx + (GameConfig.COLS - 1) / 2);
    const r = Math.round(S - 0.5 - wy);
    const p = this.game.player;
    if (r === p.r && c === p.c - 1) return 'left';
    if (r === p.r && c === p.c + 1) return 'right';
    if (c === p.c && r === p.r + 1) return 'down';
    return null;
  }

  onUiAction(action, el) {
    const ui = this.ui;
    const quiet = ['toggle', 'choose', 'buy', 'reset', 'back'];
    if (!quiet.includes(action)) this.audio.play('click');
    switch (action) {
      case 'play':
        this.startAfterAd('start', 'play', () => this.startRun('normal'));
        break;
      case 'daily':
        this.startAfterAd('start', 'daily', () => this.startRun('daily'));
        break;
      case 'retry':
        this.startAfterAd('next', 'retry', () => {
          this.newGame(this.mode);
          this.startRun(this.mode);
        });
        break;
      case 'restart':
        this.bankAbandonedRun();
        this.startAfterAd('next', 'restart', () => {
          this.newGame(this.mode);
          this.startRun(this.mode);
        });
        break;
      case 'watch-ad':
        this.watchRewardAd();
        break;
      case 'privacy-choices':
        this.ads.showPrivacyOptions();
        break;
      case 'quit':
        this.bankAbandonedRun();
        this.goToTitle();
        break;
      case 'menu':
        this.goToTitle();
        break;
      case 'pause':
        this.pause();
        break;
      case 'resume':
        this.resume();
        break;
      case 'shop':
      case 'shop-from-over':
        ui.renderShop(this.profile);
        ui.push('shop');
        break;
      case 'records':
        ui.renderRecords(this.profile);
        ui.push('records');
        break;
      case 'settings':
        ui.confirmReset = false;
        ui.renderSettings(this.settings, this.caps());
        ui.push('settings');
        break;
      case 'howto':
        ui.renderHowTo(this.isTouch());
        ui.push('howto');
        break;
      case 'about':
        ui.push('about');
        break;
      case 'back':
        this.onBack();
        break;
      case 'buy':
        this.buy(el);
        break;
      case 'toggle':
        this.toggleSetting(el.dataset.key);
        break;
      case 'choose':
        this.chooseSetting(el.dataset.key, el.dataset.value);
        break;
      case 'fullscreen':
        this.toggleFullscreen();
        break;
      case 'reset':
        this.resetProgress();
        break;
    }
  }

  buy(el) {
    const id = el.dataset.id;
    if (this.profile.buy(id)) {
      this.audio.play('buy');
      this.haptic(20);
      const unlocked = this.profile.checkAchievements();
      for (const a of unlocked) this.announceAchievement(a);
      this.ui.renderShop(this.profile);
      if (this.game && this.game.state === 'ready') this.newGame(this.game.mode);
      const again = document.querySelector(`[data-action="buy"][data-id="${id}"]`);
      if (again) again.focus({ preventScroll: true });
    } else {
      this.audio.play('denied');
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
    }
  }

  toggleSetting(key) {
    this.settings[key] = !this.settings[key];
    this.audio.play('click');
    if (key === 'muted') this.applyAudioSettings();
    if (key === 'shake') this.renderer.cameraRig.shakeEnabled = this.settings[key];
    if (key === 'haptics' && this.settings[key]) this.haptic(40);
    if (key === 'showHints' && this.settings[key]) this.profile.data.tutorial.seen = {};
    this.profile.saveSettings();
    this.ui.renderSettings(this.settings, this.caps());
    const btn = document.querySelector(`[data-action="toggle"][data-key="${key}"]`);
    if (btn) btn.focus({ preventScroll: true });
  }

  chooseSetting(key, value) {
    this.settings[key] = value;
    this.audio.play('click');
    if (key === 'quality') {
      this.autoQuality = null;
      this.applyGraphicsSettings();
    }
    if (key === 'touchControls') this.updateTouchVisibility();
    this.profile.saveSettings();
    this.ui.renderSettings(this.settings, this.caps());
    const btn = document.querySelector(`[data-action="choose"][data-key="${key}"][data-value="${value}"]`);
    if (btn) btn.focus({ preventScroll: true });
  }

  toggleFullscreen() {
    const doc = document;
    const el = doc.documentElement;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
    } else {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) req.call(el).catch?.(() => {});
    }
  }

  resetProgress() {
    if (!this.ui.confirmReset) {
      this.ui.confirmReset = true;
      this.audio.play('denied');
      this.ui.renderSettings(this.settings, this.caps());
      setTimeout(() => {
        if (this.ui.confirmReset) {
          this.ui.confirmReset = false;
          if (this.ui.current === 'settings') this.ui.renderSettings(this.settings, this.caps());
        }
      }, 3500);
      return;
    }
    this.ui.confirmReset = false;
    this.profile.reset();
    this.audio.play('back');
    this.ui.toast('Progress reset', 'A fresh start in the mine', 'info');
    this.ui.renderSettings(this.settings, this.caps());
    if (this.game && this.game.state === 'ready') this.newGame(this.game.mode);
  }

  onVisibility() {
    if (document.hidden) {
      this.pause();
      this.audio.suspend();
    } else if (!this.ads.showing) {
      this.audio.resume();
    }
  }

  // ---------------------------------------------------------------- hints

  tip(id, text, duration = 4.5) {
    if (!this.settings.showHints || this.profile.hintSeen(id)) return;
    this.profile.markHint(id);
    this.ui.hint(text, duration);
  }

  announceAchievement(a) {
    this.ui.toast(a.name, `${a.desc} · +${a.coins} coins`, 'trophy');
    this.audio.play('achievement');
  }

  // ------------------------------------------------------- game -> audio/UI

  bindGame(game) {
    const on = (name, fn) => this.unsubs.push(game.on(name, fn));
    const audio = this.audio;
    const pan = c => (c - (GameConfig.COLS - 1) / 2) / 6;

    on('energy', e => {
      this.ui.setEnergy(e.value, e.delta);
      if (e.delta < 0 && e.value <= GameConfig.LOW_ENERGY && game.state === 'playing') {
        audio.play('low_energy', { minGap: 0.5 });
        this.tip('low', 'Low energy! Collect ores to refill it.');
      }
    });
    on('score', e => this.ui.setScore(e.value));
    on('depth', e => {
      this.ui.setDepth(e.depth);
      this.achievementCheck = Math.max(this.achievementCheck, 0.01);
    });
    on('items', items => this.ui.setItems(items));
    on('combo', e => {
      this.ui.setCombo(e.multiplier);
      if (e.value >= 2) {
        audio.play('pluck', { rate: 1 + Math.min(e.value, 9) * 0.07, vary: 0 });
        this.tip('combo', 'Combo! Ores in quick succession multiply your points.');
      }
    });

    on('blockRemoved', e => {
      if (e.reason === 'dig') {
        audio.play(Math.random() < 0.5 ? 'dirt_hit' : 'dig_soft', { volume: 0.7, pan: pan(e.c), vary: 0.08 });
        if (game.stats.blocksDug === 1) this.tip('energy', 'Digging dirt costs 1 energy ⚡ - ores give it back.');
      } else if (e.reason === 'break') {
        audio.play('stone_break', { pan: pan(e.c) });
        this.haptic(25);
      }
    });

    on('collect', e => {
      if (ORE_SOUND_RATE[e.type]) {
        audio.play('gold_hit', { rate: ORE_SOUND_RATE[e.type], volume: 0.75, pan: pan(e.c) });
        if (e.type === B.GEM || e.type === B.DIAMOND) {
          audio.play('coin', { rate: e.type === B.GEM ? 1.2 : 1 });
          this.haptic(15);
        }
        this.tip('ore', 'Ores refill your energy. Keep an eye on the ⚡ counter!');
        if (e.type === B.GEM) this.ui.toast(`${GEM_VARIANTS[e.variant].name}!`, `+${e.points} points`, 'gem');
        this.achievementCheck = Math.max(this.achievementCheck, 0.01);
      } else if (e.type === B.TORCH) {
        audio.play('torch_pickup', { volume: 0.8 });
        this.tip('torch', 'Torches light up the next section for a moment. Memorize the safe path!', 5);
      } else if (e.item === 'pickaxe') {
        audio.play('pickaxe_pickup');
        this.tip('pickaxe', 'Pickaxes break stone. Reinforced stone and obsidian need several hits.');
      } else if (e.item === 'flare') {
        audio.play('pickaxe_pickup', { rate: 1.2 });
        this.tip('flare', this.isTouch() ? 'Tap the flare button to light up the area for a moment.' : 'Press F to fire a flare and light up the area.');
      } else if (e.item === 'shield') {
        audio.play('pickaxe_pickup', { rate: 0.9 });
        this.tip('shield', 'A hard hat saves you from one deadly hit.');
      }
    });

    on('chest', e => {
      audio.play('chest');
      const r = e.reward;
      const text = {
        energy: `+${r.amount} energy`,
        pickaxe: 'A pickaxe!',
        flare: 'A flare!',
        shield: 'A hard hat!',
        coins: `+${r.amount} coins`
      }[r.kind];
      this.ui.toast('Treasure chest', text, 'coin');
      this.haptic(20);
    });

    on('move', e => {
      this.runMoves = (this.runMoves || 0) + 1;
      if (this.runMoves > 8) this.ui.setKeyHints(false);
      if (e.to.r === S) this.tip('dark', 'Your lamp only lights nearby blocks. Head for the torch below!', 5);
      this.checkTntWarning();
    });
    on('hit', e => {
      audio.play('stone_hit', { pan: pan(e.c) });
      this.haptic(15);
    });
    on('bump', e => {
      if (e.reason === 'pickaxe') {
        audio.play('stone_hit', { volume: 0.5, rate: 0.8 });
        this.tip('stone', 'Stone needs a pickaxe. Find one, or dig around it.');
      } else if (e.reason === 'energy' || e.reason === 'flare') {
        audio.play('denied', { minGap: 0.2 });
      } else {
        audio.play('bump', { minGap: 0.15, volume: 0.6 });
      }
    });
    on('fallStart', () => audio.play('fall', { volume: 0.6 }));
    on('land', e => {
      if (e.steps > 0) audio.play('land', { volume: Math.min(1, 0.4 + e.steps * 0.15) });
      if (e.steps > 2) this.haptic(20);
    });
    on('page', e => {
      if (!e.reveal) audio.play('step', { volume: 0.4 });
    });
    on('revealStart', e => {
      audio.play('reveal', { volume: 0.7 });
      if (e.kind === 'page') this.ui.banner('Memorize!', '', 'memorize', 1.3);
    });
    on('flare', () => {
      audio.play('flare');
      this.achievementCheck = Math.max(this.achievementCheck, 0.01);
    });
    on('ignite', () => audio.play('fuse', { volume: 0.8 }));
    on('tntPrimed', () => audio.play('fuse', { volume: 0.6, minGap: 0.1 }));
    on('explosion', e => {
      audio.play('tnt_hit', { volume: 0.9, pan: pan(e.c) });
      audio.play('boom', { volume: 0.9 });
      this.haptic([60, 30, 90]);
      this.achievementCheck = Math.max(this.achievementCheck, 0.01);
    });
    on('boulderWobble', e => {
      audio.play('rumble', { pan: pan(e.c), minGap: 0.3 });
      this.tip('boulder', 'Loose boulder! Step aside before it falls.');
    });
    on('boulderLand', e => audio.play('boulder_impact', { pan: pan(e.c), volume: 0.8 }));
    on('boulderShatter', e => audio.play('stone_break', { pan: pan(e.c) }));
    on('monsterWake', e => {
      audio.play('monster_wake', { pan: pan(e.monster.c), volume: 0.8 });
      this.tip('monster', 'A monster woke up! It hunts you through open tunnels - keep moving.', 5);
    });
    on('monsterMove', e => audio.play('monster_step', { volume: 0.35, pan: pan(e.to.c), minGap: 0.08 }));
    on('monsterAttack', () => audio.play('chomp'));
    on('monsterDie', e => {
      audio.play('monster_die', { pan: pan(e.monster.c) });
      this.achievementCheck = Math.max(this.achievementCheck, 0.01);
    });
    on('shieldBreak', () => {
      audio.play('shield');
      this.haptic([40, 40, 40]);
    });
    on('milestone', e => {
      audio.play('milestone');
      this.ui.banner(`${e.depth} m`, `+${e.energy} energy · +${e.points.toLocaleString('en-US')} points`);
    });
    on('biome', e => {
      this.audio.setMusicStyle(e.biome.music);
      setTimeout(() => {
        if (this.state === 'playing' && this.game === game) this.ui.banner(e.biome.name, `${e.biome.from} m below the surface`, 'biome');
      }, 900);
    });
    on('death', e => this.onDeath(e));
  }

  checkTntWarning() {
    const p = this.game.player;
    if (p.r < S || this.profile.hintSeen('tnt')) return;
    for (const [dc, dr] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) {
      if (this.game.grid.get(p.c + dc, p.r + dr) === B.TNT) {
        this.tip('tnt', 'Careful - that red crate is TNT. Never dig into it!');
        return;
      }
    }
  }

  // ------------------------------------------------------------------ frame

  frame(dt) {
    this.input.update(dt);
    const game = this.game;
    if (this.state !== 'paused') {
      game.update(dt);
      this.world.update(dt);
    }

    const rv = game.reveal;
    this.ui.setRevealBar(this.state === 'playing' && rv.kind === 'page' && rv.delay <= 0 ? rv.timer / rv.duration : 0);

    if (this.state === 'playing') {
      this.updateMusicIntensity();
      this.updateAmbientAudio(dt);
      if (this.keyHintTimer > 0) {
        this.keyHintTimer -= dt;
        if (this.keyHintTimer <= 0) this.ui.setKeyHints(false);
      }
      if (this.achievementCheck > 0) {
        this.achievementCheck -= dt;
        if (this.achievementCheck <= 0) this.checkLiveAchievements();
      }
      this.trackPerformance(dt);
    }
  }

  checkLiveAchievements() {
    this.achievementCheck = 0;
    const unlocked = this.profile.checkAchievements({ run: this.game.getResults() });
    for (const a of unlocked) {
      this.runAchievements.push(a);
      this.announceAchievement(a);
    }
  }

  updateMusicIntensity() {
    const game = this.game;
    const p = game.player;
    let intensity = 0.22 + Math.min(game.maxDepth / 250, 0.25);
    const danger = game.monsters.some(m => m.awake && Math.abs(m.c - p.c) + Math.abs(m.r - p.r) <= 6);
    if (danger) intensity += 0.4;
    if (p.energy <= GameConfig.LOW_ENERGY && p.r >= S) intensity += 0.2;
    this.audio.setIntensity(intensity);
  }

  // Cave drips, and a heartbeat when a monster is close
  updateAmbientAudio(dt) {
    const game = this.game;
    const p = game.player;
    if (p.r < S) return;
    this.dripTimer = (this.dripTimer ?? 4) - dt;
    if (this.dripTimer <= 0) {
      this.dripTimer = 4 + Math.random() * 7;
      this.audio.play('drip', { volume: 0.45, pan: Math.random() * 1.6 - 0.8, rate: 0.75 + Math.random() * 0.5 });
    }
    const near = game.monsters.some(m => m.awake && Math.abs(m.c - p.c) + Math.abs(m.r - p.r) <= 3);
    if (near) {
      this.beatTimer = (this.beatTimer ?? 0) - dt;
      if (this.beatTimer <= 0) {
        this.beatTimer = 0.8;
        this.audio.play('heartbeat', { volume: 0.75, vary: 0 });
      }
    } else {
      this.beatTimer = 0;
    }
  }

  // Step graphics quality down if the device struggles (auto mode only)
  trackPerformance(dt) {
    if (this.settings.quality !== 'auto') return;
    const perf = this.perf;
    perf.time += dt;
    perf.frames++;
    if (perf.time < 4) return;
    const fps = perf.frames / perf.time;
    perf.time = 0;
    perf.frames = 0;
    const current = this.currentQuality();
    if (fps < 42 && current !== 'low') {
      this.autoQuality = current === 'high' ? 'medium' : 'low';
      this.applyGraphicsSettings();
    }
  }
}

