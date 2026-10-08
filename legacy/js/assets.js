/*
  Asset Loader - handles images and sounds
  Sophisticated audio system with Web Audio API
*/

class AudioManager {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.fxGain = null;
    this.musicGain = null;

    this.buffers = {};
    this.isUnlocked = false;
    this.pendingUnlock = [];

    // Music state
    this.musicSource = null;
    this.musicPlaying = false;
    this.fadingSource = null;  // Track source that's fading out
    this.currentMusicBuffer = null;
    this.pendingMusicStart = null;  // Track pending music start request

    // Sound debouncing to prevent overlapping rapid sounds
    this.lastPlayTime = {};
    this.minPlayInterval = 50; // ms between same sound plays

    // Volume settings
    this.fxVolume = 0.5;
    this.musicVolume = 0.3;

    // Active sources for cleanup
    this.activeSources = new Set();
  }

  init() {
    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)();

      // Create gain nodes
      this.masterGain = this.context.createGain();
      this.masterGain.connect(this.context.destination);

      this.fxGain = this.context.createGain();
      this.fxGain.gain.value = this.fxVolume;
      this.fxGain.connect(this.masterGain);

      this.musicGain = this.context.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.masterGain);

      // Setup unlock listeners for mobile
      this.setupUnlockListeners();

      return true;
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
      return false;
    }
  }

  setupUnlockListeners() {
    const unlock = async () => {
      if (this.isUnlocked) return;

      try {
        if (this.context.state === 'suspended') {
          await this.context.resume();
        }

        // Play a silent buffer to fully unlock
        const silentBuffer = this.context.createBuffer(1, 1, 22050);
        const source = this.context.createBufferSource();
        source.buffer = silentBuffer;
        source.connect(this.context.destination);
        source.start(0);

        this.isUnlocked = true;

        // Process any pending operations
        this.pendingUnlock.forEach(fn => fn());
        this.pendingUnlock = [];

        // Remove listeners once unlocked
        document.removeEventListener('touchstart', unlock, true);
        document.removeEventListener('touchend', unlock, true);
        document.removeEventListener('click', unlock, true);
        document.removeEventListener('keydown', unlock, true);
      } catch (e) {
        console.warn('Audio unlock failed:', e);
      }
    };

    document.addEventListener('touchstart', unlock, true);
    document.addEventListener('touchend', unlock, true);
    document.addEventListener('click', unlock, true);
    document.addEventListener('keydown', unlock, true);
  }

  async ensureUnlocked() {
    if (this.isUnlocked) return true;

    if (this.context && this.context.state === 'suspended') {
      try {
        await this.context.resume();
        this.isUnlocked = true;
        return true;
      } catch (e) {
        return false;
      }
    }

    return this.isUnlocked;
  }

  async loadAudioFile(name, url) {
    // Initialize fallback storage
    this.fallbackAudio = this.fallbackAudio || {};

    // First, always load HTML Audio as fallback (works with file:// protocol)
    try {
      const audio = new Audio();
      audio.preload = 'auto';

      await new Promise((resolve, reject) => {
        const onCanPlay = () => {
          audio.removeEventListener('error', onError);
          resolve();
        };
        const onError = (e) => {
          audio.removeEventListener('canplaythrough', onCanPlay);
          reject(e);
        };
        audio.addEventListener('canplaythrough', onCanPlay, { once: true });
        audio.addEventListener('error', onError, { once: true });
        audio.src = url;
        audio.load();

        // Timeout fallback
        setTimeout(() => resolve(), 3000);
      });

      this.fallbackAudio[name] = audio;
    } catch (e) {
      console.warn(`Failed to load fallback audio: ${url}`, e);
    }

    // Then try to load as Web Audio buffer (better quality, but needs server)
    // Skip fetch attempt if we're on file:// protocol
    if (window.location.protocol === 'file:') {
      return null;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const arrayBuffer = await response.arrayBuffer();

      const audioBuffer = await new Promise((resolve, reject) => {
        this.context.decodeAudioData(
          arrayBuffer,
          (buffer) => resolve(buffer),
          (err) => reject(err || new Error('Decode failed'))
        );
      });

      this.buffers[name] = audioBuffer;
      return audioBuffer;
    } catch (e) {
      // Fetch failed, but we already have fallback audio loaded
      return null;
    }
  }

  generateBuffer(generator) {
    try {
      return generator(this.context);
    } catch (e) {
      console.warn('Failed to generate audio buffer:', e);
      return null;
    }
  }

  setBuffer(name, buffer) {
    if (buffer) {
      this.buffers[name] = buffer;
    }
  }

  playSound(name, options = {}) {
    const {
      volume = 0.5,
      debounce = true,
      loop = false,
      onEnded = null
    } = options;

    // Debounce rapid plays of the same sound
    if (debounce) {
      const now = performance.now();
      const lastTime = this.lastPlayTime[name] || 0;
      if (now - lastTime < this.minPlayInterval) {
        return null;
      }
      this.lastPlayTime[name] = now;
    }

    // Check if Web Audio buffer exists
    const buffer = this.buffers[name];

    if (buffer) {
      // Use Web Audio API (better quality)
      if (!this.isUnlocked) {
        this.pendingUnlock.push(() => this.playSound(name, options));
        return null;
      }

      try {
        if (this.context.state === 'suspended') {
          this.context.resume();
        }

        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.loop = loop;

        const gainNode = this.context.createGain();
        gainNode.gain.value = volume;

        source.connect(gainNode);
        gainNode.connect(this.fxGain);

        this.activeSources.add(source);

        source.onended = () => {
          this.activeSources.delete(source);
          if (onEnded) onEnded();
        };

        source.start(0);
        return source;
      } catch (e) {
        console.warn(`Web Audio failed for: ${name}`, e);
        // Fall through to HTML Audio fallback
      }
    }

    // Use HTML Audio fallback
    const fallbackAudio = this.fallbackAudio && this.fallbackAudio[name];
    if (fallbackAudio) {
      try {
        // Clone the audio element to allow overlapping plays
        const clone = fallbackAudio.cloneNode();
        clone.volume = volume * this.fxVolume;
        clone.loop = loop;

        if (onEnded) {
          clone.addEventListener('ended', onEnded, { once: true });
        }

        clone.play().catch(() => {
          // Playback failed, likely due to autoplay policy
        });

        return clone;
      } catch (e) {
        console.warn(`Fallback audio failed for: ${name}`, e);
      }
    }

    return null;
  }

  startMusic(name, fadeInDuration = 0.5) {
    // Stop any currently fading source immediately
    if (this.fadingSource) {
      try {
        this.fadingSource.stop();
      } catch (e) {
        // Already stopped
      }
      this.fadingSource = null;
    }

    // If there's a pending start request, just update it
    if (this.pendingMusicStart) {
      this.pendingMusicStart = { name, fadeInDuration };
      return;
    }

    // If music is currently playing, stop it first then start new
    if (this.musicPlaying || this.musicSource) {
      this.stopMusic(0.3, () => this._startMusicInternal(name, fadeInDuration));
      return;
    }
    this._startMusicInternal(name, fadeInDuration);
  }

  _startMusicInternal(name, fadeInDuration) {
    // Clear pending request since we're executing it now
    this.pendingMusicStart = null;

    const buffer = this.buffers[name];
    if (!buffer) {
      console.warn(`Music not found: ${name}`);
      return;
    }

    // If music is already playing, don't start another
    if (this.musicPlaying || this.musicSource) {
      return;
    }

    if (!this.isUnlocked) {
      // Only queue if there's no pending request already
      if (!this.pendingMusicStart) {
        this.pendingMusicStart = { name, fadeInDuration };
        this.pendingUnlock.push(() => {
          if (this.pendingMusicStart) {
            const { name: n, fadeInDuration: f } = this.pendingMusicStart;
            this._startMusicInternal(n, f);
          }
        });
      }
      return;
    }

    try {
      if (this.context.state === 'suspended') {
        this.context.resume();
      }

      this.musicSource = this.context.createBufferSource();
      this.musicSource.buffer = buffer;
      this.musicSource.loop = true;
      this.currentMusicBuffer = name;

      // Fade in
      this.musicGain.gain.setValueAtTime(0, this.context.currentTime);
      this.musicGain.gain.linearRampToValueAtTime(
        this.musicVolume,
        this.context.currentTime + fadeInDuration
      );

      this.musicSource.connect(this.musicGain);
      this.musicSource.start(0);
      this.musicPlaying = true;
    } catch (e) {
      console.warn('Failed to start music:', e);
    }
  }

  stopMusic(fadeOutDuration = 0.5, callback = null) {
    // Clear any pending music start request
    this.pendingMusicStart = null;

    // Stop any already-fading source immediately
    if (this.fadingSource) {
      try {
        this.fadingSource.stop();
      } catch (e) {
        // Already stopped
      }
      this.fadingSource = null;
    }

    if (!this.musicSource) {
      this.musicPlaying = false;
      if (callback) callback();
      return;
    }

    try {
      // Move current source to fading
      this.fadingSource = this.musicSource;
      this.musicSource = null;
      this.musicPlaying = false;

      // Fade out
      this.musicGain.gain.setValueAtTime(
        this.musicGain.gain.value,
        this.context.currentTime
      );
      this.musicGain.gain.linearRampToValueAtTime(
        0,
        this.context.currentTime + fadeOutDuration
      );

      // Stop after fade
      const fadingRef = this.fadingSource;
      setTimeout(() => {
        try {
          fadingRef.stop();
        } catch (e) {
          // Already stopped
        }
        // Only clear if it's still the same fading source
        if (this.fadingSource === fadingRef) {
          this.fadingSource = null;
        }
        if (callback) callback();
      }, fadeOutDuration * 1000);
    } catch (e) {
      console.warn('Failed to stop music:', e);
      this.musicPlaying = false;
      this.fadingSource = null;
      if (callback) callback();
    }
  }

  setFxVolume(volume) {
    this.fxVolume = Math.max(0, Math.min(1, volume));
    if (this.fxGain) {
      this.fxGain.gain.setValueAtTime(this.fxVolume, this.context.currentTime);
    }
  }

  setMusicVolume(volume) {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.musicGain && this.musicPlaying) {
      this.musicGain.gain.setValueAtTime(this.musicVolume, this.context.currentTime);
    }
  }

  stopAll() {
    this.pendingMusicStart = null;
    this.stopMusic(0);
    if (this.fadingSource) {
      try {
        this.fadingSource.stop();
      } catch (e) {
        // Already stopped
      }
      this.fadingSource = null;
    }
    this.activeSources.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Already stopped
      }
    });
    this.activeSources.clear();
  }
}

// Sound generators
const SoundGenerators = {
  stoneBreak: (ctx) => {
    const duration = 0.3;
    const sampleRate = ctx.sampleRate;
    const length = duration * sampleRate;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 15);
      const noise = (Math.random() * 2 - 1) * 0.6;
      const thump = Math.sin(2 * Math.PI * 80 * t) * 0.4;
      const crunch = Math.sin(2 * Math.PI * 200 * t * (1 + Math.random() * 0.1)) * 0.3;
      data[i] = (noise + thump + crunch) * envelope;
    }
    return buffer;
  },

  stoneHit: (ctx) => {
    const duration = 0.15;
    const sampleRate = ctx.sampleRate;
    const length = duration * sampleRate;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 30);
      const thud = Math.sin(2 * Math.PI * 60 * t) * 0.5;
      const impact = Math.sin(2 * Math.PI * 150 * t) * 0.2;
      data[i] = (thud + impact) * envelope;
    }
    return buffer;
  },

  fall: (ctx) => {
    const duration = 0.4;
    const sampleRate = ctx.sampleRate;
    const length = duration * sampleRate;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const envelope = Math.sin(Math.PI * t / duration) * 0.5;
      const noise = (Math.random() * 2 - 1);
      const freq = 400 - t * 600;
      const whoosh = Math.sin(2 * Math.PI * freq * t) * 0.3;
      data[i] = (noise * 0.2 + whoosh) * envelope;
    }
    return buffer;
  },

  gameOver: (ctx) => {
    const duration = 1.2;
    const sampleRate = ctx.sampleRate;
    const length = duration * sampleRate;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 2) * 0.6;
      let freq;
      if (t < 0.3) freq = 440;
      else if (t < 0.6) freq = 349;
      else if (t < 0.9) freq = 294;
      else freq = 220;

      const vibrato = Math.sin(2 * Math.PI * 6 * t) * 5;
      const tone = Math.sin(2 * Math.PI * (freq + vibrato) * t);
      const harmonic = Math.sin(2 * Math.PI * (freq * 2 + vibrato) * t) * 0.3;
      data[i] = (tone + harmonic) * envelope;
    }
    return buffer;
  },

  backgroundMusic: (ctx) => {
    const duration = 8;
    const sampleRate = ctx.sampleRate;
    const length = duration * sampleRate;
    const buffer = ctx.createBuffer(2, length, sampleRate);
    const leftData = buffer.getChannelData(0);
    const rightData = buffer.getChannelData(1);

    const baseFreq = 110;
    const pentatonic = [1, 1.125, 1.25, 1.5, 1.667];

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const loopT = t % duration;

      const bass = Math.sin(2 * Math.PI * baseFreq * t) * 0.15;
      const bassHarmonic = Math.sin(2 * Math.PI * baseFreq * 2 * t) * 0.05;

      const padFreq = baseFreq * 2 * pentatonic[Math.floor((loopT / 2) % 5)];
      const filterMod = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.1 * t);
      const pad = Math.sin(2 * Math.PI * padFreq * t) * 0.08 * filterMod;
      const padOctave = Math.sin(2 * Math.PI * padFreq * 2 * t) * 0.04 * filterMod;

      const arpIndex = Math.floor((loopT * 2) % 5);
      const arpFreq = baseFreq * 4 * pentatonic[arpIndex];
      const arpEnv = Math.exp(-((loopT * 2) % 1) * 4);
      const arp = Math.sin(2 * Math.PI * arpFreq * t) * 0.06 * arpEnv;

      const chimeT = (loopT + 0.5) % 2;
      const chimeEnv = chimeT < 0.3 ? Math.exp(-chimeT * 10) : 0;
      const chimeFreq = baseFreq * 8 * pentatonic[(arpIndex + 2) % 5];
      const chime = Math.sin(2 * Math.PI * chimeFreq * t) * 0.03 * chimeEnv;

      const noiseT = loopT % 4;
      const noiseEnv = noiseT < 0.5 ? Math.sin(Math.PI * noiseT / 0.5) * 0.02 : 0;
      const noise = (Math.random() * 2 - 1) * noiseEnv;

      const sample = bass + bassHarmonic + pad + padOctave + arp + chime + noise;

      leftData[i] = sample * 0.9 + Math.sin(2 * Math.PI * padFreq * 1.002 * t) * 0.02;
      rightData[i] = sample * 0.9 + Math.sin(2 * Math.PI * padFreq * 0.998 * t) * 0.02;
    }
    return buffer;
  }
};


class AssetLoader {
  constructor() {
    this.images = {};
    this.loaded = false;

    // Initialize audio manager
    this.audio = new AudioManager();
    this.audio.init();
  }

  get fxVolume() {
    return this.audio.fxVolume;
  }

  get musicVolume() {
    return this.audio.musicVolume;
  }

  get musicPlaying() {
    return this.audio.musicPlaying || this.audio.fadingSource !== null || this.audio.pendingMusicStart !== null;
  }

  setFxVolume(volume) {
    this.audio.setFxVolume(volume);
  }

  setMusicVolume(volume) {
    this.audio.setMusicVolume(volume);
  }

  async loadImage(name, src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.images[name] = img;
        resolve(img);
      };
      img.onerror = () => {
        console.warn(`Failed to load image: ${src}`);
        resolve(null);
      };
      img.src = src;
    });
  }

  async loadAll() {
    // Load images
    await Promise.all([
      this.loadImage('torch', 'image_source/torch.gif'),
      this.loadImage('treasure', 'image_source/treasure.png'),
      this.loadImage('dirt', 'image_source/dirt_block.png'),
      this.loadImage('gold', 'image_source/gold_block.png'),
      this.loadImage('stone', 'image_source/stone_block.jpg'),
      this.loadImage('tnt', 'image_source/tnt_block.jpg'),
      this.loadImage('player', 'image_source/player.png'),
      this.loadImage('player_mirror', 'image_source/player_mirror.png'),
      this.loadImage('surface', 'image_source/surface.jpg'),
      this.loadImage('background', 'image_source/background.jpg')
    ]);

    // Load audio files
    await Promise.all([
      this.audio.loadAudioFile('dirt_hit', 'sound_source/dirt_hit.mp3'),
      this.audio.loadAudioFile('gold_hit', 'sound_source/gold_hit.mp3'),
      this.audio.loadAudioFile('tnt_hit', 'sound_source/tnt_hit.mp3'),
      this.audio.loadAudioFile('torch_pickup', 'sound_source/torch_pickup.mp3'),
      this.audio.loadAudioFile('pickaxe_pickup', 'sound_source/pickaxe_pickup.mp3')
    ]);

    // Generate procedural sounds
    this.audio.setBuffer('stone_break', this.audio.generateBuffer(SoundGenerators.stoneBreak));
    this.audio.setBuffer('stone_hit', this.audio.generateBuffer(SoundGenerators.stoneHit));
    this.audio.setBuffer('fall', this.audio.generateBuffer(SoundGenerators.fall));
    this.audio.setBuffer('game_over', this.audio.generateBuffer(SoundGenerators.gameOver));
    this.audio.setBuffer('background_music', this.audio.generateBuffer(SoundGenerators.backgroundMusic));

    this.loaded = true;
  }

  playSound(name) {
    this.audio.playSound(name, { volume: 0.5 });
  }

  startBackgroundMusic() {
    this.audio.startMusic('background_music', 1.0);
  }

  stopBackgroundMusic() {
    this.audio.stopMusic(0.5);
  }

  getImage(name) {
    return this.images[name];
  }
}
