/*
  Material library
*/

import * as pc from 'playcanvas';
import { BIOMES } from '../game/biomes.js';
import { GEM_VARIANTS } from '../game/blocks.js';

function color(hex) {
  return new pc.Color().fromString(hex);
}

export class MaterialLibrary {
  constructor(textures) {
    this.tex = textures;
    this.m = {};
    this.build();
  }

  std(name, o = {}) {
    const m = new pc.StandardMaterial();
    m.name = name;
    m.useMetalness = true;
    m.metalness = o.metalness ?? 0;
    m.gloss = o.gloss ?? 0.3;
    m.diffuse = color(o.color ?? '#FFFFFF');
    m.useSkybox = false;
    m.useFog = false;
    if (o.map) m.diffuseMap = this.tex.get(o.map);
    if (o.normal) {
      m.normalMap = this.tex.get(o.normal);
      m.bumpiness = o.bump ?? 1;
    }
    if (o.emissive) {
      m.emissive = color(o.emissive);
      m.emissiveIntensity = o.emissiveIntensity ?? 1;
    }
    if (o.emissiveMap) m.emissiveMap = this.tex.get(o.emissiveMap);
    if (o.unlit) m.useLighting = false;
    if (o.cull === false) m.cull = pc.CULLFACE_NONE;
    m.update();
    this.m[name] = m;
    return m;
  }

  get(name) {
    const m = this.m[name];
    if (!m) throw new Error(`Unknown material ${name}`);
    return m;
  }

  build() {
    // Soil per biome (two tints for variety), back wall and side rock
    for (const biome of BIOMES) {
      const k = biome.key;
      this.std(`soil_${k}`, { map: `soil_${k}`, normal: `soil_${k}_n`, bump: 0.9, gloss: 0.18 });
      this.std(`soil2_${k}`, { map: `soil_${k}`, normal: `soil_${k}_n`, bump: 0.9, gloss: 0.18, color: '#D8D2CC' });
      this.std(`ore_${k}`, { map: `soil_${k}`, normal: `soil_${k}_n`, bump: 0.9, gloss: 0.18, color: '#9C928A' });
      this.std(`back_${k}`, { map: `soil_${k}`, normal: `soil_${k}_n`, bump: 1.2, gloss: 0.08, color: '#6A625C' });
      this.std(`rock_${k}`, { map: `rock_${k}`, normal: `rock_${k}_n`, bump: 1.1, gloss: 0.1, color: '#7C746E' });
    }

    // Blocks
    this.std('stone', { map: 'stone', normal: 'stone_n', gloss: 0.28 });
    this.std('hardstone', { map: 'stone', normal: 'stone_n', gloss: 0.3, color: '#8E94A6' });
    this.std('obsidian', { map: 'obsidian', normal: 'obsidian_n', gloss: 0.88, metalness: 0.25, bump: 0.6 });
    this.std('magma', {
      map: 'basalt', normal: 'basalt_n', gloss: 0.25,
      emissive: '#FFFFFF', emissiveMap: 'basalt_e', emissiveIntensity: 2.4
    });
    this.std('tnt', { map: 'tnt', normal: 'tnt_n', gloss: 0.35, bump: 0.7 });
    this.std('fuse', { color: '#2B2420', gloss: 0.2 });
    this.std('boulder', { map: 'stone', normal: 'stone_n', color: '#B89F86', gloss: 0.22, bump: 1.4 });
    this.std('cracks', { color: '#000000' });

    // Ores
    this.std('coal', { color: '#1E1C1C', gloss: 0.62, metalness: 0.15 });
    this.std('iron', { color: '#F0C9A8', gloss: 0.7, metalness: 0.75 });
    this.std('gold', { color: '#FFC83A', gloss: 0.8, metalness: 0.7 });
    this.std('diamond', { color: '#B5F6FF', gloss: 0.95, metalness: 0.1, emissive: '#3FD6FF', emissiveIntensity: 0.1 });
    GEM_VARIANTS.forEach((v, i) => {
      this.std(`gem${i}`, { color: v.color, gloss: 0.92, metalness: 0.1, emissive: v.color, emissiveIntensity: 0.14 });
    });

    // Items and props
    this.std('wood', { map: 'wood', normal: 'wood_n', gloss: 0.22 });
    this.std('darkwood', { map: 'darkwood', normal: 'darkwood_n', gloss: 0.2 });
    this.std('plainwood', { color: '#8A5A31', gloss: 0.25 });
    this.std('metal', { color: '#9AA1AC', gloss: 0.62, metalness: 0.85 });
    this.std('darkmetal', { color: '#4A4F57', gloss: 0.5, metalness: 0.8 });
    this.std('rust', { color: '#6F5847', gloss: 0.35, metalness: 0.55 });
    this.std('cloth', { color: '#C9A46A', gloss: 0.1 });
    this.std('clothDark', { color: '#5A3A22', gloss: 0.1 });
    this.std('torchFlame', { color: '#000000', emissive: '#FF8A2A', emissiveIntensity: 2.4, unlit: true, cull: false });
    this.std('torchCore', { color: '#000000', emissive: '#FFF0B0', emissiveIntensity: 3.2, unlit: true, cull: false });
    this.std('flare', { color: '#E23B2E', gloss: 0.45 });
    this.std('white', { color: '#F2EFE8', gloss: 0.4 });
    this.std('hat', { color: '#FFB82E', gloss: 0.65 });
    this.std('lens', { color: '#FFF4D6', emissive: '#FFE9B0', emissiveIntensity: 3, gloss: 0.9 });
    this.std('chestgold', { color: '#E8B23A', gloss: 0.72, metalness: 0.8 });
    this.std('grasscap', { map: 'grass', color: '#FFFFFF', gloss: 0.15 });

    // Surface
    this.std('grass', { map: 'grass', gloss: 0.12 });
    this.std('trunk', { color: '#6B4A2D', gloss: 0.15 });
    this.std('leaves', { color: '#4C9A3F', gloss: 0.2 });
    this.std('leaves2', { color: '#357A37', gloss: 0.2 });
    this.std('pine', { color: '#2E6438', gloss: 0.2 });
    this.std('mountain', { color: '#7F8FA8', gloss: 0.1 });
    this.std('mountainFar', { color: '#A7B9D2', gloss: 0.05 });
    this.std('snow', { color: '#F4F8FC', gloss: 0.3 });
    this.std('cloud', { color: '#FFFFFF', emissive: '#E8F2FF', emissiveIntensity: 0.55, gloss: 0 });
    this.std('roof', { color: '#9C3F2C', gloss: 0.2 });
    this.std('flowerRed', { color: '#E8434E' });
    this.std('flowerYellow', { color: '#FFD447' });
    this.std('flowerWhite', { color: '#F7F3EA' });
    this.std('rockGrey', { color: '#8E8A86', gloss: 0.15 });
    this.std('sun', { color: '#000000', emissive: '#FFF1C2', emissiveIntensity: 2.2, unlit: true });
    this.std('sky', { color: '#000000', emissive: '#FFFFFF', emissiveMap: 'sky', emissiveIntensity: 1, unlit: true });
    this.std('lanternGlass', { color: '#FFD9A0', emissive: '#FFB347', emissiveIntensity: 2.5 });

    // Miner
    this.std('skin', { color: '#F2C49B', gloss: 0.3 });
    this.std('nose', { color: '#E9A582', gloss: 0.35 });
    this.std('eye', { color: '#1B1A22', gloss: 0.9 });
    this.std('brow', { color: '#5A3820', gloss: 0.1 });
    this.std('shirt', { color: '#EDE1C8', gloss: 0.15 });
    this.std('overalls', { color: '#2C83A3', gloss: 0.2 });
    this.std('bandana', { color: '#DB3A3A', gloss: 0.25 });
    this.std('gloves', { color: '#8A5A33', gloss: 0.3 });
    this.std('boots', { color: '#4A3022', gloss: 0.35 });
    this.std('pack', { color: '#7C5B3B', gloss: 0.2 });
    this.std('bedroll', { color: '#3F6B4F', gloss: 0.15 });
    this.std('button', { color: '#F0C04A', gloss: 0.8, metalness: 0.8 });

    // Monsters
    this.std('crawler', { color: '#8A1F32', gloss: 0.4 });
    this.std('crawlerDark', { color: '#43101A', gloss: 0.3 });
    this.std('monsterEye', { color: '#FFE36B', emissive: '#FFC83A', emissiveIntensity: 3.2 });
    this.std('monsterEyeGreen', { color: '#9DFF9A', emissive: '#55FF7A', emissiveIntensity: 3 });
    this.std('pupil', { color: '#120806', gloss: 0.8 });
    this.std('mouth', { color: '#1A0508', gloss: 0.3 });
    this.std('teeth', { color: '#F4EFE6', gloss: 0.5 });
    this.std('burrower', { color: '#5E5577', gloss: 0.35 });

    this.buildParticleMaterials();
    this.buildOverlayMaterials();
  }

  buildParticleMaterials() {
    const add = new pc.StandardMaterial();
    add.name = 'fxAdd';
    add.useLighting = false;
    add.useSkybox = false;
    add.useFog = false;
    add.diffuse = new pc.Color(0, 0, 0);
    add.emissive = new pc.Color(1, 1, 1);
    add.emissiveMap = this.tex.get('soft');
    add.emissiveVertexColor = true;
    add.emissiveIntensity = 1;
    add.blendType = pc.BLEND_ADDITIVE;
    add.depthWrite = false;
    add.cull = pc.CULLFACE_NONE;
    add.update();
    this.m.fxAdd = add;

    const alpha = new pc.StandardMaterial();
    alpha.name = 'fxAlpha';
    alpha.useSkybox = false;
    alpha.useFog = false;
    alpha.diffuse = new pc.Color(1, 1, 1);
    alpha.diffuseVertexColor = true;
    alpha.opacityMap = this.tex.get('softAlpha');
    alpha.opacityMapChannel = 'a';
    alpha.opacityVertexColor = true;
    alpha.opacityVertexColorChannel = 'a';
    alpha.blendType = pc.BLEND_NORMAL;
    alpha.depthWrite = false;
    alpha.cull = pc.CULLFACE_NONE;
    alpha.gloss = 0;
    alpha.update();
    this.m.fxAlpha = alpha;

    const debris = new pc.StandardMaterial();
    debris.name = 'fxDebris';
    debris.useSkybox = false;
    debris.useFog = false;
    debris.diffuse = new pc.Color(1, 1, 1);
    debris.diffuseVertexColor = true;
    debris.gloss = 0.25;
    debris.update();
    this.m.fxDebris = debris;

    const halo = new pc.StandardMaterial();
    halo.name = 'halo';
    halo.useLighting = false;
    halo.useSkybox = false;
    halo.useFog = false;
    halo.diffuse = new pc.Color(0, 0, 0);
    halo.emissive = new pc.Color(1, 0.82, 0.55);
    halo.emissiveMap = this.tex.get('soft');
    halo.emissiveIntensity = 1;
    halo.blendType = pc.BLEND_ADDITIVE;
    halo.depthWrite = false;
    halo.cull = pc.CULLFACE_NONE;
    halo.update();
    this.m.halo = halo;

    const torchHalo = halo.clone();
    torchHalo.name = 'torchHalo';
    torchHalo.emissive = new pc.Color(1, 0.55, 0.18);
    torchHalo.update();
    this.m.torchHalo = torchHalo;
  }

  buildOverlayMaterials() {
    for (const stage of [1, 2]) {
      const m = new pc.StandardMaterial();
      m.name = `cracks${stage}`;
      m.diffuse = new pc.Color(0.05, 0.03, 0.02);
      m.opacityMap = this.tex.get(`cracks${stage}`);
      m.opacityMapChannel = 'a';
      m.blendType = pc.BLEND_NORMAL;
      m.depthWrite = false;
      m.useSkybox = false;
      m.update();
      this.m[`cracks${stage}`] = m;
    }
  }
}
