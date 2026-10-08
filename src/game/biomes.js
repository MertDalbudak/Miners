/*
  Depth layers. Each biome changes the look of the mine, the music and
  which blocks appear.
*/

export const BIOMES = [
  {
    key: 'topsoil',
    name: 'Topsoil',
    from: 0,
    dirt: '#8B5A33',
    dirtAlt: '#7A4D2B',
    back: '#3A2414',
    rock: '#4E3420',
    accent: '#C99A5B',
    particle: 'dust',
    music: { root: 57, scale: 'minorPenta', tempo: 84 }
  },
  {
    key: 'clay',
    name: 'Clay Caves',
    from: 25,
    dirt: '#B0623A',
    dirtAlt: '#9C5532',
    back: '#45210F',
    rock: '#5C2E1A',
    accent: '#F08B52',
    particle: 'dust',
    music: { root: 55, scale: 'dorian', tempo: 88 }
  },
  {
    key: 'granite',
    name: 'Granite Depths',
    from: 60,
    dirt: '#8E8576',
    dirtAlt: '#7E7666',
    back: '#25272E',
    rock: '#3A3D46',
    accent: '#9FB3D9',
    particle: 'drip',
    music: { root: 52, scale: 'minor', tempo: 92 }
  },
  {
    key: 'magma',
    name: 'Magma Core',
    from: 100,
    dirt: '#5A3A36',
    dirtAlt: '#4D302D',
    back: '#1E1010',
    rock: '#2E1A18',
    accent: '#FF7A2E',
    particle: 'ember',
    music: { root: 50, scale: 'phrygian', tempo: 100 }
  },
  {
    key: 'crystal',
    name: 'Crystal Abyss',
    from: 150,
    dirt: '#4B3F78',
    dirtAlt: '#40366A',
    back: '#140F26',
    rock: '#251D40',
    accent: '#7DF0FF',
    particle: 'spark',
    music: { root: 54, scale: 'lydian', tempo: 76 }
  }
];

export function biomeIndexAt(depth) {
  let index = 0;
  for (let i = 0; i < BIOMES.length; i++) {
    if (depth >= BIOMES[i].from) index = i;
  }
  return index;
}

export function biomeAt(depth) {
  return BIOMES[biomeIndexAt(depth)];
}
