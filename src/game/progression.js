/*
  Meta progression: upgrades bought with coins, and achievements.
*/

import { GEM_VARIANTS } from './blocks.js';

export const UPGRADES = [
  {
    id: 'stamina',
    name: 'Stamina',
    icon: 'energy',
    desc: level => `Start with ${10 + level * 2} energy`,
    costs: [40, 90, 180, 350, 600]
  },
  {
    id: 'lamp',
    name: 'Headlamp',
    icon: 'lamp',
    desc: level => (level === 0 ? 'Brighter lamp, see further' : `Lamp radius +${level * 12}%`),
    costs: [60, 150, 320, 600]
  },
  {
    id: 'prospector',
    name: 'Prospector',
    icon: 'gem',
    desc: level => (level === 0 ? 'Ores appear more often' : `+${level * 10}% ores`),
    costs: [50, 120, 250, 450, 800]
  },
  {
    id: 'toolbelt',
    name: 'Toolbelt',
    icon: 'pickaxe',
    desc: level => (level === 0 ? 'Start with a pickaxe' : `Start with ${level} pickaxe${level > 1 ? 's' : ''}`),
    costs: [80, 200, 450]
  },
  {
    id: 'flares',
    name: 'Flare Pack',
    icon: 'flare',
    desc: level => (level === 0 ? 'Start with a flare' : `Start with ${level} flare${level > 1 ? 's' : ''}`),
    costs: [60, 160, 360]
  },
  {
    id: 'torch',
    name: 'Torch Mastery',
    icon: 'torch',
    desc: level => `Reveals last ${(2 + level * 0.75).toFixed(2).replace(/\.?0+$/, '')}s`,
    costs: [50, 140, 300]
  },
  {
    id: 'hardhat',
    name: 'Hard Hat',
    icon: 'shield',
    desc: level => (level === 0 ? 'Start every run with a hard hat' : 'Start with a hard hat'),
    costs: [400]
  }
];

export function upgradeCost(upgrade, level) {
  return level < upgrade.costs.length ? upgrade.costs[level] : null;
}

/*
  Achievements are checked against the finished run (`run`) and lifetime
  stats (`life`), plus a few live events (`event`).
*/
export const ACHIEVEMENTS = [
  { id: 'first_dig', name: 'Breaking Ground', desc: 'Dig your first block', coins: 10, check: ({ run }) => run.stats.blocksDug > 0 },
  { id: 'depth_25', name: 'Into the Clay', desc: 'Reach 25 m', coins: 20, check: ({ run }) => run.depth >= 25 },
  { id: 'depth_60', name: 'Stone Cold', desc: 'Reach 60 m', coins: 40, check: ({ run }) => run.depth >= 60 },
  { id: 'depth_100', name: 'Hot Stuff', desc: 'Reach 100 m', coins: 80, check: ({ run }) => run.depth >= 100 },
  { id: 'depth_150', name: 'Crystal Clear', desc: 'Reach 150 m', coins: 120, check: ({ run }) => run.depth >= 150 },
  { id: 'depth_250', name: 'Journey to the Core', desc: 'Reach 250 m', coins: 250, check: ({ run }) => run.depth >= 250 },
  { id: 'coal_100', name: 'Coal Collector', desc: 'Collect 100 coal in total', coins: 30, check: ({ life }) => life.ores.coal >= 100 },
  { id: 'diamond', name: 'Shine Bright', desc: 'Find a diamond', coins: 30, check: ({ run }) => run.stats.ores.diamond > 0 },
  { id: 'gem', name: 'Rare Find', desc: 'Find a gem', coins: 40, check: ({ run }) => run.stats.gems.some(n => n > 0) },
  { id: 'rainbow', name: 'Rainbow Hunter', desc: `Find all ${GEM_VARIANTS.length} kinds of gems`, coins: 200, check: ({ life }) => life.gems.every(n => n > 0) },
  { id: 'combo', name: 'On a Roll', desc: 'Reach a x3 combo', coins: 50, check: ({ run }) => run.stats.maxCombo >= 9 },
  { id: 'torch_10', name: 'Torchbearer', desc: 'Collect 10 torches in one run', coins: 40, check: ({ run }) => run.stats.torches >= 10 },
  { id: 'boulder', name: 'Rock Bottom', desc: 'Crush a monster with a boulder', coins: 50, check: ({ run }) => run.stats.boulderKills > 0 },
  { id: 'tnt_shield', name: 'Hard Headed', desc: 'Survive a TNT blast with a hard hat', coins: 40, check: ({ run }) => run.stats.survivedTnt > 0 },
  { id: 'chain', name: 'Chain Reaction', desc: 'Make TNT set off more TNT', coins: 40, check: ({ run }) => run.stats.chainReactions > 0 },
  { id: 'chests_5', name: 'Treasure Hunter', desc: 'Open 5 chests in total', coins: 50, check: ({ life }) => life.chests >= 5 },
  { id: 'flare', name: 'Light It Up', desc: 'Use a flare', coins: 10, check: ({ run }) => run.stats.flaresUsed > 0 },
  { id: 'score_10k', name: 'High Roller', desc: 'Score 10,000 in one run', coins: 60, check: ({ run }) => run.score >= 10000 },
  { id: 'score_50k', name: 'Legend of the Mine', desc: 'Score 50,000 in one run', coins: 250, check: ({ run }) => run.score >= 50000 },
  { id: 'daily', name: 'Daily Digger', desc: 'Finish a Daily Dig', coins: 20, check: ({ run }) => run.mode === 'daily' && run.finished },
  { id: 'upgrade', name: 'Upgraded', desc: 'Buy your first upgrade', coins: 10, check: ({ profile }) => Object.values(profile.upgrades).some(l => l > 0) },
  { id: 'runs_25', name: 'Veteran Miner', desc: 'Play 25 runs', coins: 80, check: ({ life }) => life.runs >= 25 }
];
