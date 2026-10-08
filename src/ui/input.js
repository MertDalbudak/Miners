/*
  Input - keyboard, on-screen buttons, swipes, taps/clicks and gamepads all
  map to the same actions. Movement repeats while held.
*/

const REPEAT_DELAY = 0.22;
const REPEAT_RATE = 0.13;
const SWIPE_DIST = 22;
const STICK_DEADZONE = 0.5;

const KEYMAP = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowDown: 'down',
  KeyS: 'down',
  KeyF: 'flare',
  Space: 'flare',
  KeyE: 'flare',
  Escape: 'pause',
  KeyP: 'pause',
  KeyM: 'mute'
};

const NAV_KEYS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right'
};

const MOVES = new Set(['left', 'right', 'down']);

export class Input {
  constructor(options) {
    this.o = options;
    this.held = new Map();
    this.pointer = null;
    this.pads = new Map();
    this.lastDevice = 'pointer';
    this.bindKeyboard();
    this.bindPointer();
    this.bindButtons();
  }

  emit(action) {
    if (MOVES.has(action) || action === 'flare') this.o.onAction(action);
  }

  press(source, action) {
    this.emit(action);
    if (MOVES.has(action)) this.held.set(source, { action, t: REPEAT_DELAY });
  }

  release(source) {
    this.held.delete(source);
  }

  releaseAll() {
    this.held.clear();
  }

  // ---------------------------------------------------------------- keyboard

  bindKeyboard() {
    window.addEventListener('keydown', e => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.code === 'Escape') e.target.blur();
        return;
      }
      this.lastDevice = 'keyboard';
      const action = KEYMAP[e.code];
      if (this.o.isPlaying()) {
        if (!action) return;
        e.preventDefault();
        if (e.repeat) return;
        if (action === 'pause') this.o.onPause();
        else if (action === 'mute') this.o.onMute();
        else this.press(`key:${e.code}`, action);
        return;
      }
      // Menus
      if (e.code === 'Escape') {
        e.preventDefault();
        this.o.onBack();
      } else if (e.code === 'KeyM') {
        this.o.onMute();
      } else if (NAV_KEYS[e.code]) {
        if (this.o.navigate(NAV_KEYS[e.code], e.target)) e.preventDefault();
      } else if (this.o.onAnyKey) {
        this.o.onAnyKey(e);
      }
    });
    window.addEventListener('keyup', e => this.release(`key:${e.code}`));
    window.addEventListener('blur', () => this.releaseAll());
  }

  // ---------------------------------------------- swipe / tap on the canvas

  bindPointer() {
    const el = this.o.canvas;
    el.addEventListener('pointerdown', e => {
      if (!this.o.isPlaying()) {
        if (this.o.onCanvasTap) this.o.onCanvasTap();
        return;
      }
      this.lastDevice = e.pointerType === 'touch' ? 'touch' : 'mouse';
      this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, fired: false, t: performance.now() };
      try {
        el.setPointerCapture(e.pointerId);
      } catch (err) {
        // ignore
      }
      e.preventDefault();
    });
    el.addEventListener('pointermove', e => {
      const p = this.pointer;
      if (!p || p.id !== e.pointerId || p.fired) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (Math.hypot(dx, dy) < SWIPE_DIST) return;
      p.fired = true;
      let action = null;
      if (Math.abs(dx) > Math.abs(dy)) action = dx > 0 ? 'right' : 'left';
      else if (dy > 0) action = 'down';
      if (action) this.press('swipe', action);
    });
    const end = e => {
      const p = this.pointer;
      if (!p || p.id !== e.pointerId) return;
      this.pointer = null;
      this.release('swipe');
      if (!p.fired && e.type === 'pointerup' && performance.now() - p.t < 450) {
        const action = this.o.tapAction ? this.o.tapAction(e.clientX, e.clientY) : null;
        if (action) this.emit(action);
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // ---------------------------------------------------- on-screen buttons

  bindButtons() {
    const buttons = document.querySelectorAll('[data-dir]');
    buttons.forEach(btn => {
      const dir = btn.dataset.dir;
      const source = `btn:${dir}`;
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        this.lastDevice = 'touch';
        try {
          btn.setPointerCapture(e.pointerId);
        } catch (err) {
          // ignore
        }
        btn.classList.add('pressed');
        if (this.o.isPlaying()) this.press(source, dir);
      });
      const up = () => {
        btn.classList.remove('pressed');
        this.release(source);
      };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
      btn.addEventListener('contextmenu', e => e.preventDefault());
    });
  }

  // ---------------------------------------------------------------- gamepad

  pollGamepads(dt) {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    // forget controllers that went away, including any direction they held
    for (const index of [...this.pads.keys()]) {
      const pad = pads[index];
      if (pad && pad.connected) continue;
      for (const source of [...this.held.keys()]) {
        if (source.startsWith(`pad:${index}:`)) this.held.delete(source);
      }
      this.pads.delete(index);
    }
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const prev = this.pads.get(pad.index) || { buttons: [], dirs: {} };
      const pressed = i => !!(pad.buttons[i] && pad.buttons[i].pressed);
      const edge = i => pressed(i) && !prev.buttons[i];
      const ax = pad.axes[0] || 0;
      const ay = pad.axes[1] || 0;
      const dirs = {
        left: pressed(14) || ax < -STICK_DEADZONE,
        right: pressed(15) || ax > STICK_DEADZONE,
        down: pressed(13) || ay > STICK_DEADZONE,
        up: pressed(12) || ay < -STICK_DEADZONE
      };
      if (pad.buttons.some(b => b && b.pressed) || Object.values(dirs).some(Boolean)) this.lastDevice = 'gamepad';

      if (this.o.isPlaying()) {
        for (const dir of ['left', 'right', 'down']) {
          const source = `pad:${pad.index}:${dir}`;
          if (dirs[dir] && !prev.dirs[dir]) this.press(source, dir);
          if (!dirs[dir] && prev.dirs[dir]) this.release(source);
        }
        if (edge(2) || edge(3) || edge(5)) this.emit('flare');
        if (edge(9) || edge(1)) this.o.onPause();
      } else {
        prev.navTimer = (prev.navTimer || 0) - dt;
        for (const dir of ['up', 'down', 'left', 'right']) {
          if (dirs[dir] && (!prev.dirs[dir] || prev.navTimer <= 0)) {
            this.o.navigate(dir, document.activeElement);
            prev.navTimer = prev.dirs[dir] ? 0.16 : 0.35;
          }
        }
        if (edge(0) || edge(9)) this.o.onConfirm();
        if (edge(1)) this.o.onBack();
      }
      this.pads.set(pad.index, {
        buttons: pad.buttons.map(b => b && b.pressed),
        dirs,
        navTimer: prev.navTimer
      });
    }
  }

  update(dt) {
    this.pollGamepads(dt);
    if (!this.o.isPlaying()) {
      this.held.clear();
      return;
    }
    for (const h of this.held.values()) {
      h.t -= dt;
      if (h.t <= 0) {
        this.emit(h.action);
        h.t += REPEAT_RATE;
      }
    }
  }
}
