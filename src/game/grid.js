/*
  Grid - stores every cell of the mine shaft.
  Rows are created lazily by the level generator and never discarded, so the
  whole mine can be shown again after the run ends.
*/

import { B } from './blocks.js';
import { GameConfig } from '../config.js';

export const CellFlag = Object.freeze({
  TUNNEL: 1,  // pre-generated void (monster lair)
  DUG: 2,     // opened by the player or an explosion
  PATH: 4     // carved to guarantee a route to a torch
});

export class Grid {
  constructor(cols = GameConfig.COLS) {
    this.cols = cols;
    this.rows = new Map();
    this.maxRow = -1;
    this.version = 0; // bumped on every change so views can refresh lazily
  }

  createRow(r) {
    const row = {
      type: new Uint8Array(this.cols),
      hp: new Uint8Array(this.cols),
      variant: new Uint8Array(this.cols),
      flags: new Uint8Array(this.cols),
      version: 0
    };
    this.rows.set(r, row);
    if (r > this.maxRow) this.maxRow = r;
    return row;
  }

  hasRow(r) {
    return this.rows.has(r);
  }

  inBounds(c) {
    return c >= 0 && c < this.cols;
  }

  get(c, r) {
    if (c < 0 || c >= this.cols) return B.BEDROCK;
    if (r < GameConfig.SURFACE_ROWS) return B.EMPTY;
    const row = this.rows.get(r);
    return row ? row.type[c] : B.DIRT;
  }

  set(c, r, type, hp = 1, variant = 0) {
    const row = this.rows.get(r);
    if (!row || c < 0 || c >= this.cols) return;
    row.type[c] = type;
    row.hp[c] = hp;
    row.variant[c] = variant;
    row.version++;
    this.version++;
  }

  clear(c, r, flag = CellFlag.DUG) {
    const row = this.rows.get(r);
    if (!row || c < 0 || c >= this.cols) return;
    row.type[c] = B.EMPTY;
    row.hp[c] = 0;
    row.variant[c] = 0;
    row.flags[c] |= flag;
    row.version++;
    this.version++;
  }

  getHp(c, r) {
    const row = this.rows.get(r);
    return row && c >= 0 && c < this.cols ? row.hp[c] : 0;
  }

  setHp(c, r, hp) {
    const row = this.rows.get(r);
    if (row && c >= 0 && c < this.cols) {
      row.hp[c] = hp;
      row.version++;
      this.version++;
    }
  }

  getVariant(c, r) {
    const row = this.rows.get(r);
    return row && c >= 0 && c < this.cols ? row.variant[c] : 0;
  }

  getFlags(c, r) {
    const row = this.rows.get(r);
    return row && c >= 0 && c < this.cols ? row.flags[c] : 0;
  }

  addFlag(c, r, flag) {
    const row = this.rows.get(r);
    if (row && c >= 0 && c < this.cols) row.flags[c] |= flag;
  }

  removeFlag(c, r, flag) {
    const row = this.rows.get(r);
    if (row && c >= 0 && c < this.cols) row.flags[c] &= ~flag;
  }

  isEmpty(c, r) {
    return this.get(c, r) === B.EMPTY;
  }
}
