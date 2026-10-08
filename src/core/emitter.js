/*
  Tiny event emitter used to decouple game rules from rendering, audio and UI.
*/

export class Emitter {
  constructor() {
    this._handlers = new Map();
  }

  on(name, fn) {
    if (!this._handlers.has(name)) this._handlers.set(name, new Set());
    this._handlers.get(name).add(fn);
    return () => this.off(name, fn);
  }

  off(name, fn) {
    const set = this._handlers.get(name);
    if (set) set.delete(fn);
  }

  emit(name, data) {
    const set = this._handlers.get(name);
    if (set) {
      for (const fn of [...set]) fn(data);
    }
    const any = this._handlers.get('*');
    if (any) {
      for (const fn of [...any]) fn(name, data);
    }
  }
}
