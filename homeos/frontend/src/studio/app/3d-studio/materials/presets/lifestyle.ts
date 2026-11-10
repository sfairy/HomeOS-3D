/** 档位表：宠物、儿童、影音、健身、餐具与园艺。 */

import type { Recipe } from './preset-combos'
import type { MaterialStylePreset } from './preset-core'
import { definePreset } from './preset-core'

/* ------------------------------------------------------------------ *
 * 新增品类档位：宠物 / 儿童 / 影音 / 健身 / 器皿 / 庭院
 *
 * 这些品类没有既有档位（面板上「材质风格」是空的），且它们的角色名（`petPad` /
 * `playBody` / `sportFrame` / `basket` / `leaf`…）也不在既有档位表的词表里。这里按**真实语义**
 * 给每组 4 个档位，并把该品类出现过的角色**显式写全**，保证「档位 → 槽位」交集非空（不空转）。
 * ------------------------------------------------------------------ */

/** 宠物用品：主体 / 框架 / 底座 / 软垫 / 食盆 / 猫砂 / 抓柱 / 剑麻绳。 */
function petRoleRecipes(colors: {
  body: number
  frame: number
  pad: number
  bowl: number
  litter: number
  rope: number
}): Record<string, Recipe> {
  return {
    petBody: { surface: 'paint', color: colors.body },
    body: { surface: 'paint', color: colors.body },
    soft: { surface: 'fabric', color: colors.pad },
    light: { surface: 'paint', color: 0xefe9de },
    panel: { surface: 'wood', color: colors.frame },
    petFrame: { surface: 'wood', color: colors.frame },
    frame: { surface: 'wood', color: colors.frame },
    rackWood: { surface: 'wood', color: colors.frame },
    petBase: { surface: 'wood', color: colors.frame },
    base: { surface: 'wood', color: colors.frame },
    trim: { surface: 'wood', color: colors.frame },
    dark: { surface: 'wood', color: colors.rope },
    petPad: { surface: 'fabric', color: colors.pad },
    scratchingPost: { surface: 'fabric', color: colors.pad },
    rope: { surface: 'fabric', color: colors.rope },
    petBowl: { surface: 'ceramic', color: colors.bowl },
    container: { surface: 'ceramic', color: colors.bowl },
    litter: { surface: 'stone', color: colors.litter },
    rack: { surface: 'metal', color: 0xb6bbbf },
    water: { surface: 'glass', color: 0x8fbdd0, transparent: true, opacity: 0.45, depthWrite: false },
    glass: { surface: 'glass', color: 0xcfe0e6, transparent: true, opacity: 0.4, depthWrite: false },
  }
}

export const PET_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'pet-oak',
    '原木米白',
    'wood',
    { furniture: 0xb08a5e, furnitureLight: 0xe4ded2, furnitureDark: 0x8c6b44 },
    petRoleRecipes({
      body: 0xe4ded2,
      frame: 0xb08a5e,
      pad: 0xb7bfae,
      bowl: 0xeeeae2,
      litter: 0xdcd6c8,
      rope: 0xc3ad86,
    }),
  ),
  definePreset(
    'pet-walnut',
    '胡桃木灰',
    'wood',
    { furniture: 0x6b4526, furnitureLight: 0xd8d2c6, furnitureDark: 0x4a2e1a },
    petRoleRecipes({
      body: 0xd8d2c6,
      frame: 0x6b4526,
      pad: 0x9aa39b,
      bowl: 0xe6e3dc,
      litter: 0xd2cbbd,
      rope: 0xa9855c,
    }),
  ),
  definePreset(
    'pet-grey',
    '雾灰布艺',
    'fabric',
    { furniture: 0x9aa3a6, furnitureLight: 0xc9ccce, furnitureDark: 0x6f7679 },
    petRoleRecipes({
      body: 0xc9ccce,
      frame: 0x7b8184,
      pad: 0x9aa3a6,
      bowl: 0xdcdcd8,
      litter: 0xc8c4bb,
      rope: 0xb0a998,
    }),
  ),
  definePreset(
    'pet-cream',
    '奶油白',
    'paint',
    { furniture: 0xe8e2d6, furnitureLight: 0xf5f1ea, furnitureDark: 0xc3bcaf },
    petRoleRecipes({
      body: 0xf2efe8,
      frame: 0xe8e2d6,
      pad: 0xe3dcc9,
      bowl: 0xf3f1ec,
      litter: 0xded7c8,
      rope: 0xd0bb92,
    }),
  ),
])

/** 儿童家具 / 玩具：玩具主体 / 点缀 / 球 / 帐篷布 / 层板 / 架体。 */
function kidsRoleRecipes(colors: {
  body: number
  accent: number
  ball: number
  tent: number
  wood: number
  shelf: number
}): Record<string, Recipe> {
  return {
    playBody: { surface: 'paint', color: colors.body },
    body: { surface: 'paint', color: colors.body },
    base: { surface: 'paint', color: colors.wood },
    playAccent: { surface: 'paint', color: colors.accent },
    accent: { surface: 'paint', color: colors.accent },
    playBall: { surface: 'paint', color: colors.ball },
    tentFabric: { surface: 'fabric', color: colors.tent },
    soft: { surface: 'fabric', color: colors.tent },
    shelf: { surface: 'wood', color: colors.shelf },
    rackWood: { surface: 'wood', color: colors.wood },
    grip: { surface: 'metal', color: 0xb6bbbf },
    frame: { surface: 'wood', color: colors.wood },
    glass: { surface: 'glass', color: 0xcfe0e6, transparent: true, opacity: 0.4, depthWrite: false },
  }
}

export const KIDS_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'kids-pastel',
    '马卡龙',
    'paint',
    { furniture: 0xa9c9d8, furnitureLight: 0xe6eef2, furnitureDark: 0x7fa3b5 },
    kidsRoleRecipes({
      body: 0xa9c9d8,
      accent: 0xe0a36b,
      ball: 0xd06e6e,
      tent: 0xc9d6c3,
      wood: 0xd9bf9a,
      shelf: 0xc8ab84,
    }),
  ),
  definePreset(
    'kids-natural',
    '原木本色',
    'wood',
    { furniture: 0xc49a6c, furnitureLight: 0xe3d4be, furnitureDark: 0x9c6b3f },
    kidsRoleRecipes({
      body: 0xe3d4be,
      accent: 0xc98f52,
      ball: 0xb9855c,
      tent: 0xd8cbb0,
      wood: 0xc49a6c,
      shelf: 0xb08a5e,
    }),
  ),
  definePreset(
    'kids-ocean',
    '海洋蓝',
    'paint',
    { furniture: 0x6f9fc4, furnitureLight: 0xc9deee, furnitureDark: 0x4a7396 },
    kidsRoleRecipes({
      body: 0x6f9fc4,
      accent: 0xf2c14e,
      ball: 0xe4d9c3,
      tent: 0x9dc0d8,
      wood: 0xcbb894,
      shelf: 0xb8a37c,
    }),
  ),
  definePreset(
    'kids-cream',
    '奶油白',
    'paint',
    { furniture: 0xf2efe8, furnitureLight: 0xfbfaf7, furnitureDark: 0xd8d4cb },
    kidsRoleRecipes({
      body: 0xf2efe8,
      accent: 0xe0a36b,
      /** 奶油白：球池的球单独给「奶粉 → 藕粉」一色，别和「马卡龙」的同一颗红球撞车（否则两档整机同色）。 */
      ball: 0xe8c6bd,
      tent: 0xe9e2d3,
      wood: 0xdcc9ab,
      shelf: 0xcbb894,
    }),
  ),
])

/** 影音 / 乐器 / 数码：外壳 / 面板 / 屏 / 边框 / 支架 / 格栅 / 镜头 / 唱盘 / 发光件。 */
function mediaRoleRecipes(colors: {
  shell: number
  panel: number
  frame: number
  screen: number
  accent: number
}): Record<string, Recipe> {
  return {
    shell: { surface: 'lacquer', color: colors.shell },
    body: { surface: 'lacquer', color: colors.shell },
    panel: { surface: 'lacquer', color: colors.panel },
    dark: { surface: 'lacquer', color: colors.panel },
    bezel: { surface: 'lacquer', color: colors.panel },
    frame: { surface: 'wood', color: colors.frame },
    stand: { surface: 'metal', color: colors.accent },
    base: { surface: 'lacquer', color: colors.panel },
    trim: { surface: 'metal', color: colors.accent },
    handle: { surface: 'metal', color: colors.accent },
    grille: { surface: 'metal', color: colors.accent },
    metal: { surface: 'metal', color: colors.accent },
    rackWood: { surface: 'wood', color: colors.frame },
    basket: { surface: 'wood', color: colors.frame },
    lens: { surface: 'glass', color: 0x1f2933 },
    platter: { surface: 'lacquer', color: colors.panel },
    screen: { surface: 'lacquer', color: colors.screen },
    glow: { surface: 'lacquer', color: 0x7fd1e0, emissive: 0x7fd1e0, emissiveIntensity: 0.5 },
  }
}

export const MEDIA_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'media-black',
    '黑曜石',
    'lacquer',
    { appliance: 0x2b2f34, applianceSoft: 0x3a3f45, applianceDark: 0x1c1f23 },
    mediaRoleRecipes({
      shell: 0x2b2f34,
      panel: 0x1c1f23,
      frame: 0x30343a,
      screen: 0x0f1114,
      accent: 0x6d747b,
    }),
  ),
  definePreset(
    'media-walnut',
    '胡桃木',
    'wood',
    { appliance: 0x3a3330, applianceSoft: 0x6b4526, applianceDark: 0x241f1c },
    mediaRoleRecipes({
      shell: 0x3a3330,
      panel: 0x2a2422,
      frame: 0x6b4526,
      screen: 0x0f1114,
      accent: 0xb08d5a,
    }),
  ),
  definePreset(
    'media-white',
    '象牙白',
    'lacquer',
    { appliance: 0xe9e6df, applianceSoft: 0xf4f2ec, applianceDark: 0xc9c5bc },
    mediaRoleRecipes({
      shell: 0xe9e6df,
      panel: 0xd8d4cb,
      frame: 0xdcc9ab,
      screen: 0x14171a,
      accent: 0xb6bbbf,
    }),
  ),
  definePreset(
    'media-silver',
    '银灰',
    'metal',
    { appliance: 0x9aa1a8, applianceSoft: 0xb6bbbf, applianceDark: 0x5b6167 },
    mediaRoleRecipes({
      shell: 0x9aa1a8,
      panel: 0x5b6167,
      frame: 0x6f767b,
      screen: 0x121518,
      accent: 0xc2c7cc,
    }),
  ),
])

/** 健身器械：框架 / 配重 / 握把 / 坐垫 / 包体 / 木件 / 场地。 */
function fitnessRoleRecipes(colors: {
  frame: number
  weight: number
  grip: number
  pad: number
  wood: number
  court: number
}): Record<string, Recipe> {
  return {
    sportFrame: { surface: 'metal', color: colors.frame },
    frame: { surface: 'metal', color: colors.frame },
    base: { surface: 'metal', color: colors.frame },
    body: { surface: 'metal', color: colors.frame },
    dark: { surface: 'metal', color: colors.weight },
    weight: { surface: 'metal', color: colors.weight },
    grip: { surface: 'leather', color: colors.grip },
    pad: { surface: 'fabric', color: colors.pad },
    surface: { surface: 'fabric', color: colors.pad },
    soft: { surface: 'fabric', color: colors.pad },
    trim: { surface: 'metal', color: colors.grip },
    bagBody: { surface: 'leather', color: colors.grip },
    wood: { surface: 'wood', color: colors.wood },
    rackWood: { surface: 'wood', color: colors.wood },
    courtFelt: { surface: 'fabric', color: colors.court },
  }
}

export const FITNESS_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'fitness-carbon',
    '碳黑',
    'metal',
    { appliance: 0x2f3338, applianceSoft: 0x53585e, applianceDark: 0x1f2226 },
    fitnessRoleRecipes({
      frame: 0x2f3338,
      weight: 0x53585e,
      grip: 0x1f2226,
      pad: 0x3a3f45,
      wood: 0xa9855c,
      court: 0x2f6f4f,
    }),
  ),
  definePreset(
    'fitness-silver',
    '银灰',
    'metal',
    { appliance: 0x9aa1a8, applianceSoft: 0xc2c7cc, applianceDark: 0x5b6167 },
    fitnessRoleRecipes({
      frame: 0x9aa1a8,
      weight: 0x5b6167,
      grip: 0x3a3d42,
      pad: 0x8d949a,
      wood: 0xb08a5e,
      court: 0x3f7f5c,
    }),
  ),
  definePreset(
    'fitness-oak',
    '原木黑',
    'wood',
    { appliance: 0x2b2f34, applianceSoft: 0xc49a6c, applianceDark: 0x1c1f23 },
    fitnessRoleRecipes({
      frame: 0x2b2f34,
      weight: 0x3a3f45,
      grip: 0x23262b,
      pad: 0xc49a6c,
      wood: 0xc49a6c,
      court: 0x2f6f4f,
    }),
  ),
  definePreset(
    'fitness-sand',
    '沙白',
    'paint',
    { appliance: 0xdcd6c8, applianceSoft: 0xefe9de, applianceDark: 0x9d968a },
    fitnessRoleRecipes({
      frame: 0xdcd6c8,
      weight: 0x9d968a,
      grip: 0x6f6a60,
      pad: 0xc7b48f,
      wood: 0xc49a6c,
      court: 0x4f8a63,
    }),
  ),
])

/** 器皿 / 收纳：篮筐 / 架体 / 木架 / 砧板 / 容器 / 盖 / 杯 / 壶 / 五金。 */
function tablewareRoleRecipes(colors: {
  ceramic: number
  wood: number
  basket: number
  metal: number
}): Record<string, Recipe> {
  return {
    mug: { surface: 'ceramic', color: colors.ceramic },
    plate: { surface: 'ceramic', color: colors.ceramic },
    potBody: { surface: 'ceramic', color: colors.ceramic },
    container: { surface: 'ceramic', color: colors.ceramic },
    containerLid: { surface: 'lacquer', color: colors.ceramic },
    base: { surface: 'ceramic', color: colors.ceramic },
    board: { surface: 'wood', color: colors.wood },
    rackWood: { surface: 'wood', color: colors.wood },
    wood: { surface: 'wood', color: colors.wood },
    basket: { surface: 'wood', color: colors.basket },
    trim: { surface: 'metal', color: colors.metal },
    handle: { surface: 'metal', color: colors.metal },
    rack: { surface: 'metal', color: colors.metal },
    metal: { surface: 'metal', color: colors.metal },
    window: { surface: 'glass', color: 0xcfe0e6, transparent: true, opacity: 0.4, depthWrite: false },
  }
}

export const TABLEWARE_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'tableware-white',
    '白瓷原木',
    'ceramic',
    { applianceSoft: 0xe7e2d6, wood: 0xc9a878, decorAccent: 0xc0975e },
    tablewareRoleRecipes({ ceramic: 0xeae6dc, wood: 0xc9a878, basket: 0xc0975e, metal: 0xb6bbbf }),
  ),
  definePreset(
    'tableware-oak',
    '浅橡木',
    'wood',
    { applianceSoft: 0xf0ece4, wood: 0xd0ab7c, decorAccent: 0xa9855c },
    tablewareRoleRecipes({ ceramic: 0xf0ece4, wood: 0xd0ab7c, basket: 0xa9855c, metal: 0xb0a894 }),
  ),
  definePreset(
    'tableware-bamboo',
    '竹编',
    'wood',
    { applianceSoft: 0xe4dcc6, wood: 0xc2b184, decorAccent: 0xb09b6a },
    tablewareRoleRecipes({ ceramic: 0xe9e3d4, wood: 0xc2b184, basket: 0xb09b6a, metal: 0xb8ae94 }),
  ),
  definePreset(
    'tableware-steel',
    '不锈钢',
    'metal',
    { applianceSoft: 0xdcdcd8, wood: 0x8d9298, decorAccent: 0x9aa1a8 },
    tablewareRoleRecipes({ ceramic: 0xdcdcd8, wood: 0x8d9298, basket: 0xb6bbbf, metal: 0xc2c7cc }),
  ),
])

/** 庭院：铺装 / 浅石 / 深色木石 / 植被 / 水面 / 花色。 */
function gardenRoleRecipes(colors: {
  base: number
  light: number
  dark: number
  leaf: number
  water: number
  accent: number
}): Record<string, Recipe> {
  return {
    base: { surface: 'stone', color: colors.base },
    planter: { surface: 'ceramic', color: colors.dark },
    light: { surface: 'stone', color: colors.light },
    stone: { surface: 'stone', color: colors.light },
    dark: { surface: 'wood', color: colors.dark },
    wood: { surface: 'wood', color: colors.dark },
    leaf: { surface: 'foliage', color: colors.leaf },
    foliage: { surface: 'foliage', color: colors.leaf },
    grassTuft: { surface: 'foliage', color: colors.leaf },
    soil: { surface: 'stone', color: 0x3b3128 },
    water: { surface: 'glass', color: colors.water, transparent: true, opacity: 0.45, depthWrite: false },
    accent: { surface: 'foliage', color: colors.accent },
    flower: { surface: 'foliage', color: colors.accent },
    glass: { surface: 'glass', color: colors.water, transparent: true, opacity: 0.42, depthWrite: false },
  }
}

export const GARDEN_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'garden-natural',
    '常绿庭园',
    'stone',
    { ground: 0x9a9484, leafColor: 0x4f7a3d, decorAccent: 0xd08a9a },
    gardenRoleRecipes({
      base: 0x9a9484,
      light: 0xc8c2b4,
      dark: 0x4d463a,
      leaf: 0x4f7a3d,
      water: 0x4f8ea8,
      accent: 0xd08a9a,
    }),
  ),
  definePreset(
    'garden-olive',
    '橄榄灰绿',
    'stone',
    { ground: 0x8f9083, leafColor: 0x647a3c, decorAccent: 0xc9a05a },
    gardenRoleRecipes({
      base: 0x8f9083,
      light: 0xbcc0b0,
      dark: 0x45483c,
      leaf: 0x647a3c,
      water: 0x54819a,
      accent: 0xc9a05a,
    }),
  ),
  definePreset(
    'garden-autumn',
    '秋色',
    'stone',
    { ground: 0xa2907a, leafColor: 0x8a7a2e, decorAccent: 0xc06a3a },
    gardenRoleRecipes({
      base: 0xa2907a,
      light: 0xd0bfa4,
      dark: 0x51412f,
      leaf: 0x8a7a2e,
      water: 0x4a7f9c,
      accent: 0xc06a3a,
    }),
  ),
  definePreset(
    'garden-stone',
    '素石庭园',
    'stone',
    { ground: 0xb3ada0, leafColor: 0x6b8a52, decorAccent: 0xc7b48f },
    gardenRoleRecipes({
      base: 0xb3ada0,
      light: 0xd9d4c9,
      dark: 0x6b665c,
      leaf: 0x6b8a52,
      water: 0x7fb3c8,
      accent: 0xc7b48f,
    }),
  ),
])
