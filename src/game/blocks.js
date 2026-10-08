/*
  Block types and their rules
*/

export const B = Object.freeze({
  EMPTY: 0,
  DIRT: 1,
  COAL: 2,
  IRON: 3,
  GOLD: 4,
  DIAMOND: 5,
  GEM: 6,
  STONE: 7,
  HARDSTONE: 8,
  OBSIDIAN: 9,
  TNT: 10,
  TORCH: 11,
  PICKAXE: 12,
  SHIELD: 13,
  FLARE: 14,
  CHEST: 15,
  BOULDER: 16,
  MAGMA: 17,
  BEDROCK: 255 // virtual: outside the shaft
});

// How the player interacts with a block
export const Dig = Object.freeze({
  NONE: 'none',     // empty space
  SOFT: 'soft',     // costs energy
  FREE: 'free',     // collectible, no cost
  HARD: 'hard',     // needs pickaxe hits
  DEADLY: 'deadly', // TNT
  WALL: 'wall'      // bedrock
});

export const GEM_VARIANTS = [
  { key: 'green', name: 'Emerald', color: '#3FE08A', points: 500 },
  { key: 'blue', name: 'Sapphire', color: '#4C86FF', points: 600 },
  { key: 'red', name: 'Ruby', color: '#FF3B5C', points: 700 },
  { key: 'purple', name: 'Amethyst', color: '#B067FF', points: 800 },
  { key: 'yellow', name: 'Topaz', color: '#FFC93C', points: 1000 }
];

export const BLOCK_INFO = {
  [B.EMPTY]: { key: 'empty', name: 'Empty', dig: Dig.NONE },
  [B.DIRT]: { key: 'dirt', name: 'Dirt', dig: Dig.SOFT, cost: 1, points: 10 },
  [B.MAGMA]: { key: 'magma', name: 'Magma Rock', dig: Dig.SOFT, cost: 3, points: 40 },

  [B.COAL]: { key: 'coal', name: 'Coal', dig: Dig.FREE, ore: true, energy: 2, points: 25, coins: 1 },
  [B.IRON]: { key: 'iron', name: 'Iron', dig: Dig.FREE, ore: true, energy: 3, points: 50, coins: 2 },
  [B.GOLD]: { key: 'gold', name: 'Gold', dig: Dig.FREE, ore: true, energy: 4, points: 100, coins: 4 },
  [B.DIAMOND]: { key: 'diamond', name: 'Diamond', dig: Dig.FREE, ore: true, energy: 6, points: 250, coins: 10 },
  [B.GEM]: { key: 'gem', name: 'Gem', dig: Dig.FREE, ore: true, energy: 10, points: 500, coins: 25 },

  [B.TORCH]: { key: 'torch', name: 'Torch', dig: Dig.FREE, energy: 5, points: 100 },
  [B.PICKAXE]: { key: 'pickaxe', name: 'Pickaxe', dig: Dig.FREE, item: 'pickaxe', points: 25 },
  [B.SHIELD]: { key: 'shield', name: 'Hard Hat', dig: Dig.FREE, item: 'shield', points: 25 },
  [B.FLARE]: { key: 'flare', name: 'Flare', dig: Dig.FREE, item: 'flare', points: 25 },
  [B.CHEST]: { key: 'chest', name: 'Chest', dig: Dig.FREE, item: 'chest', points: 250 },

  [B.STONE]: { key: 'stone', name: 'Stone', dig: Dig.HARD, hp: 1, points: 30 },
  [B.HARDSTONE]: { key: 'hardstone', name: 'Reinforced Stone', dig: Dig.HARD, hp: 2, points: 60 },
  [B.OBSIDIAN]: { key: 'obsidian', name: 'Obsidian', dig: Dig.HARD, hp: 3, points: 120 },
  [B.BOULDER]: { key: 'boulder', name: 'Boulder', dig: Dig.HARD, hp: 1, points: 40 },

  [B.TNT]: { key: 'tnt', name: 'TNT', dig: Dig.DEADLY },
  [B.BEDROCK]: { key: 'bedrock', name: 'Bedrock', dig: Dig.WALL }
};

export function blockInfo(type) {
  return BLOCK_INFO[type] || BLOCK_INFO[B.EMPTY];
}

export function isOre(type) {
  return !!blockInfo(type).ore;
}

// Blocks that cannot be passed without a pickaxe or that kill
export function isPathBlocker(type) {
  const dig = blockInfo(type).dig;
  return dig === Dig.HARD || dig === Dig.DEADLY || dig === Dig.WALL;
}

export function blockPoints(type, variant = 0) {
  if (type === B.GEM) return GEM_VARIANTS[variant]?.points ?? 500;
  return blockInfo(type).points || 0;
}

export const ORE_KEYS = ['coal', 'iron', 'gold', 'diamond'];
