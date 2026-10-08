/*
  Generative music. A small look-ahead sequencer plays pads, bass, arpeggios
  and soft percussion. Each biome picks its own key, mode and tempo; the
  intensity parameter (danger, low energy) thickens the arrangement.
*/

const SCALES = {
  minorPenta: [0, 3, 5, 7, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  major: [0, 2, 4, 5, 7, 9, 11]
};

// Chord roots as scale degrees
const PROGRESSIONS = {
  minorPenta: [0, 3, 1, 4],
  minor: [0, 5, 2, 6],
  dorian: [0, 3, 0, 6],
  phrygian: [0, 1, 0, 5],
  lydian: [0, 1, 4, 2],
  major: [0, 4, 5, 3]
};

const midiToHz = m => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  constructor(ctx, output) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(output);

    // Cave reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.8);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.35;
    this.reverb.connect(this.wet);
    this.wet.connect(this.out);

    this.dry = ctx.createGain();
    this.dry.gain.value = 0.8;
    this.dry.connect(this.out);
    this.dry.connect(this.reverb);

    // Echo for the arpeggio
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.36;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.32;
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.dry);

    this.style = { root: 57, scale: 'minorPenta', tempo: 84 };
    this.intensity = 0.2;
    this.targetIntensity = 0.2;
    this.playing = false;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  impulse(seconds) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  setStyle(style) {
    this.style = { ...this.style, ...style };
  }

  setIntensity(v) {
    this.targetIntensity = Math.max(0, Math.min(1, v));
  }

  start(fade = 2) {
    if (this.playing) return;
    this.playing = true;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0.9, t + fade);
    this.nextTime = t + 0.1;
    this.step = 0;
    this.timer = setInterval(() => this.schedule(), 40);
  }

  stop(fade = 1.2) {
    if (!this.playing) return;
    this.playing = false;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + fade);
    clearInterval(this.timer);
    this.timer = null;
  }

  scaleNote(degree, octave = 0) {
    const scale = SCALES[this.style.scale] || SCALES.minor;
    const n = scale.length;
    const idx = ((degree % n) + n) % n;
    const oct = Math.floor(degree / n);
    return this.style.root + scale[idx] + 12 * (oct + octave);
  }

  schedule() {
    const ctx = this.ctx;
    this.intensity += (this.targetIntensity - this.intensity) * 0.05;
    const stepDur = 60 / this.style.tempo / 2; // eighth notes
    while (this.nextTime < ctx.currentTime + 0.2) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  playStep(step, t, stepDur) {
    const prog = PROGRESSIONS[this.style.scale] || PROGRESSIONS.minor;
    const bar = Math.floor(step / 8);
    const chordDegree = prog[Math.floor(bar / 2) % prog.length];
    const inBar = step % 8;
    const I = this.intensity;

    // Pad on each chord change
    if (step % 16 === 0) {
      const dur = stepDur * 16;
      for (const d of [0, 2, 4]) this.pad(midiToHz(this.scaleNote(chordDegree + d, 0)), t, dur, 0.05);
      this.pad(midiToHz(this.scaleNote(chordDegree, -1)), t, dur, 0.04);
    }

    // Bass
    if (inBar === 0 || (I > 0.45 && inBar === 4) || (I > 0.7 && inBar % 2 === 0)) {
      this.bass(midiToHz(this.scaleNote(chordDegree, -2)), t, stepDur * (I > 0.7 ? 1.6 : 3.5), 0.22);
    }

    // Arpeggio - denser with intensity
    const chance = 0.35 + I * 0.55;
    if (Math.random() < chance) {
      const pattern = [0, 2, 4, 2, 7, 4, 2, 4];
      const deg = chordDegree + pattern[inBar] + (Math.random() < 0.15 ? 7 : 0);
      this.pluck(midiToHz(this.scaleNote(deg, 1)), t, 0.07 + Math.random() * 0.03);
    }

    // Percussion only when things heat up
    if (I > 0.35 && inBar % 2 === 1) this.hat(t, 0.025 * I);
    if (I > 0.6 && (inBar === 0 || inBar === 4)) this.kick(t, 0.25 * I);
  }

  pad(freq, t, dur, gain) {
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600 + this.intensity * 1400;
    filter.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(gain * 0.8, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, t + dur * 1.05);
    filter.connect(g);
    g.connect(this.dry);
    for (const detune of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(filter);
      o.start(t);
      o.stop(t + dur * 1.1);
    }
  }

  bass(freq, t, dur, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.dry);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  pluck(freq, t, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.6);
    o.connect(g);
    g.connect(this.dry);
    g.connect(this.delay);
    o.start(t);
    o.stop(t + 0.65);
  }

  hat(t, gain) {
    const ctx = this.ctx;
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.05);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.dry);
    src.start(t);
    src.stop(t + 0.06);
  }

  kick(t, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g);
    g.connect(this.dry);
    o.start(t);
    o.stop(t + 0.3);
  }
}
