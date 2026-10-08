/*
  Game configuration and tuning constants
*/

export const GameInfo = {
  VERSION: '2.0.0',
  DEVELOPER: 'Mert Dalbudak',
  ORIGINAL_YEAR: 2015,
  REMASTER_YEAR: 2026
};

export const GameConfig = {
  COLS: 11,
  SURFACE_ROWS: 2,        // rows 0..1 are sky, row 2 is the first diggable row
  START_COL: 5,

  // Energy (the original game called these "gems")
  START_ENERGY: 10,
  LOW_ENERGY: 3,

  // Timing (seconds)
  MOVE_TIME: 0.13,
  FALL_STEP_START: 0.11,
  FALL_STEP_MIN: 0.045,
  FALL_ACCEL: 0.012,
  SCROLL_TIME: 0.6,
  REVEAL_TIME: 2.0,
  REVEAL_FADE: 0.45,
  FLARE_TIME: 1.6,
  SURFACE_FADE: 1.1,
  QUEUE_EXPIRE: 0.3,
  INVULNERABLE_TIME: 1.0,

  // Paging: the camera shows a "page" whose top is 2 rows above the player.
  ROWS_ABOVE_PLAYER: 2,
  PAGE_ROWS: 15,

  // Torches
  FIRST_TORCH_MIN: 8,
  FIRST_TORCH_MAX: 10,

  // Monsters
  MONSTER_MIN_DEPTH: 30,
  MONSTER_SPAWN_CHANCE: 0.45,
  MONSTER_WAKE_DIST: 4,
  MONSTER_WAKE_TIME: 0.7,
  MONSTER_INTERVAL_START: 1.1,
  MONSTER_INTERVAL_MIN: 0.5,
  MONSTER_SPEEDUP_PER_M: 0.004,
  MONSTER_MAX: 5,
  BURROWER_MIN_DEPTH: 110,
  TUNNEL_CHANCE: 0.15,
  TUNNEL_MIN_GAP: 8,

  // Boulders
  BOULDER_WOBBLE: 0.55,
  BOULDER_STEP: 0.1,

  // Explosions
  CHAIN_DELAY: 0.18,

  // Combo
  COMBO_WINDOW_MOVES: 4,
  COMBO_STEP: 0.25,
  COMBO_MAX: 3,

  // Scoring
  DEPTH_POINTS: 5,
  MONSTER_POINTS: 300,
  MILESTONE_ENERGY: 3,

  // Lamp radius (cells) - view only
  LAMP_RANGE: 3.2,
  LAMP_RANGE_PER_LEVEL: 0.35
};

export const MILESTONES = [25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000];

export const Colors = {
  ACCENT: '#FFCE4B',
  BUTTON: '#E66037',
  BUTTON_SHADOW: '#A54021',
  ENERGY: '#7CF25C',
  DANGER: '#FF4D4D'
};
