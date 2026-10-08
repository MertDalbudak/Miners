/*
  Game Configuration
*/

const GameInfo = {
  VERSION: '1.0.0',
  DEVELOPER: 'Mert Dalbudak',
  ORIGINAL_YEAR: 2015,
  MODERNIZED_YEAR: 2026
};

const BlockType = {
  DIRT: 0,
  GOLD: 1,
  TNT: 3,
  STONE: 4,
  TORCH: 5,
  DIAMOND: 6,
  PICKAXE: 7,
  COAL: 8,
  IRON: 9,
  REINFORCED_STONE: 10,  // 2 hits
  OBSIDIAN: 11,          // 3 hits
  EMERALD: 12,
  VOID: -1
};

// Emerald variants with different colors and point values
const EmeraldVariant = {
  GREEN: { color: '#50C878', points: 500 },
  BLUE: { color: '#0F52BA', points: 600 },
  RED: { color: '#E0115F', points: 700 },
  PURPLE: { color: '#9966CC', points: 800 },
  YELLOW: { color: '#FFD700', points: 1000 }
};

const EmeraldVariants = Object.keys(EmeraldVariant);

const GameConfig = {
  GRID_COLUMNS: 8,
  VISIBLE_ROWS: 12,
  SURFACE_ROWS: 2,
  INITIAL_MOVES: 10,

  // Ore move bonuses
  COAL_MOVE_BONUS: 2,
  IRON_MOVE_BONUS: 3,
  GOLD_MOVE_BONUS: 4,
  DIAMOND_MOVE_BONUS: 6,

  // Torch placement
  TORCH_MIN_ROWS_FROM_BOTTOM: 1,
  TORCH_MAX_ROWS_FROM_BOTTOM: 3,
  TORCH_REVEAL_DURATION: 2000,
  SCROLL_DURATION: 500,
  DEATH_ANIMATION_DURATION: 3000,

  // Monster settings
  MONSTER_MIN_DEPTH: 30,
  MONSTER_SPAWN_CHANCE: 0.4,
  MONSTER_MOVE_INTERVAL: 1200,
  MONSTER_MIN_SPAWN_DISTANCE: 4,
  MONSTER_MAX_ON_SCREEN: 5,
  MONSTER_HUNT_CHANCE: 0.7,

  // Depth thresholds for ore progression
  IRON_MIN_DEPTH: 20,
  GOLD_MIN_DEPTH: 40,
  DIAMOND_MIN_DEPTH: 60,
  REINFORCED_STONE_MIN_DEPTH: 30,
  OBSIDIAN_MIN_DEPTH: 70,
  BASIC_STONE_MAX_DEPTH: 40,

  // Torch settings
  TORCH_MIN_SPACING: 6,

  // Spawn chances (out of 1000)
  COAL_CHANCE: 60,           // Common early game
  IRON_CHANCE_MAX: 50,       // Gradually increases after 20m
  GOLD_CHANCE_MAX: 40,       // Gradually increases after 40m
  DIAMOND_CHANCE: 8,         // Fixed rare after 60m
  EMERALD_CHANCE: 1,         // Ultra rare (<0.1%)
  PICKAXE_CHANCE: 2,         // Extremely rare
  TNT_CHANCE_MIN: 80,
  TNT_CHANCE_MAX: 160,
  STONE_CHANCE_BASE: 100,
  REINFORCED_STONE_CHANCE_MAX: 60,
  OBSIDIAN_CHANCE_MAX: 30,

  // Difficulty scaling
  TNT_INCREASE_PER_DEPTH: 0.5,
  STONE_DECREASE_PER_DEPTH: 0.3,

  // Block hit requirements
  REINFORCED_STONE_HITS: 2,
  OBSIDIAN_HITS: 3,

  // Pickaxe
  PICKAXE_USES: 1,

  // Colors
  BUTTON_COLOR: '#E66037',
  BUTTON_SHADOW: '#A54021',
  TEXT_COLOR: '#FFCE4B',
  DIRT_STROKE: '#552B00',
  STONE_STROKE: '#5A5A5A',
  TORCH_COLOR: '#FFD700',
  DIAMOND_COLOR: '#00FFFF',
  PICKAXE_COLOR: '#C0C0C0',
  MONSTER_COLOR: '#8B0000',
  COAL_COLOR: '#2C2C2C',
  IRON_COLOR: '#D4A574',
  REINFORCED_STONE_COLOR: '#4A4A4A',
  OBSIDIAN_COLOR: '#1A0A2E'
};
