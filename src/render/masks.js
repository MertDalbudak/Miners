/*
  Light channels

  PlayCanvas rules this is built around:
  - Clustered omni/spot lights split meshes into two channels only: meshes
    with bit 1 receive lights flagged "affectDynamic", meshes without bit 1
    receive lights flagged "affectLightmapped".
  - Directional lights are only considered when their mask contains bit 1 or
    2, and then light every mesh sharing any bit with them.

  Resulting setup:
  - playfield (blocks, back wall, characters): bit 1
      lit by the miner lamp, magma, explosions and the reveal light
  - side walls and decoration: bit 16 (no bit 1 -> "lightmapped" channel)
      lit by lanterns, the miner lamp and the reveal light
  - surface scenery: bits 2 + 8
      lit by the sun and sky fill only
*/

export const Mask = Object.freeze({
  PLAYFIELD: 1,
  WALLS: 16,
  SURFACE: 2 | 8,
  PLAYER_SURFACE: 1 | 8
});

export const LightMask = Object.freeze({
  REVEAL: 1 | 16,
  SUN: 2 | 8
});
