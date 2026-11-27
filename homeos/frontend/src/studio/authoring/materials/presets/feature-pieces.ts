/** 档位表：鱼缸、钢琴、屏风、台球桌、淋浴、茶台与装饰品。 */

import {
  applianceCombo,
  aquariumCombo,
  ornamentCombo,
  pianoCombo,
  poolTableCombo,
  showerCombo,
  teaTableCombo,
} from './preset-combos'
import type { MaterialStylePreset } from './preset-core'
import { definePreset } from './preset-core'

export const AQUARIUM_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'aquarium-black-frame',
    '黑框玻璃',
    'lacquer',
    {
      furnitureDark: 0x2b2b2e,
      furniture: 0x3a3a3c,
    },
    aquariumCombo({
      body: { surface: 'lacquer', color: 0x2f3237 },

      frame: { surface: 'lacquer', color: 0x1e2126 },
    }),
  ),
  definePreset(
    'aquarium-white-frame',
    '白框玻璃',
    'paint',
    {
      furnitureDark: 0xe4e2dc,
      furniture: 0xf0efec,
    },
    aquariumCombo({
      body: { surface: 'paint', color: 0xf0efec },
      frame: { surface: 'paint', color: 0xd8d5cd },
    }),
  ),
  definePreset(
    'aquarium-wood-frame',
    '原木框',
    'wood',
    {
      furnitureDark: 0x6b4526,
      furniture: 0xc49a6c,
    },
    aquariumCombo({
      body: { surface: 'wood', color: 0xc49a6c },

      frame: { surface: 'wood', color: 0x6b4526 },
      top: { surface: 'wood', color: 0x8f6a45 },
    }),
  ),
])

export const PIANO_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'piano-black',
    '亮光黑',
    'lacquer',
    {
      furniture: 0x1e1e20,
      furnitureDark: 0x111113,
      furnitureSoft: 0x3a3a3c,
    },
    pianoCombo({
      body: { surface: 'lacquer', color: 0x1a1a1c },
      top: { surface: 'lacquer', color: 0x24242a },
      panel: { surface: 'lacquer', color: 0x1e1e20 },
      leg: { surface: 'lacquer', color: 0x1a1a1c },
      metal: { surface: 'metal', color: 0x9aa1a8 },
    }),
  ),
  definePreset(
    'piano-white',
    '亮光白',
    'lacquer',
    {
      furniture: 0xf2f1ed,
      furnitureDark: 0xd8d6d0,
      furnitureSoft: 0xfbfaf8,
    },
    pianoCombo({
      body: { surface: 'lacquer', color: 0xf2f1ed },
      top: { surface: 'lacquer', color: 0xfbfaf8 },
      panel: { surface: 'lacquer', color: 0xefece6 },
      leg: { surface: 'lacquer', color: 0xf2f1ed },
      metal: { surface: 'metal', color: 0xb4babf },
    }),
  ),
  definePreset(
    'piano-wood',
    '暖木色',
    'wood',
    {
      wood: 0x6b4526,
      woodLight: 0x855c36,
      woodDark: 0x4a2e1a,
      furniture: 0x6b4526,
      furnitureDark: 0x4a2e1a,
      furnitureSoft: 0x855c36,
    },
    pianoCombo({
      body: { surface: 'wood', color: 0x6b4526 },
      top: { surface: 'wood', color: 0x7a5230 },
      panel: { surface: 'wood', color: 0x5f3d21 },
      leg: { surface: 'wood', color: 0x6b4526 },

      metal: { surface: 'metal', color: 0xb08d5a },
    }),
  ),
])

export const SCREEN_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'screen-black',
    '曜黑',
    'lacquer',
    {
      appliance: 0x2a2c30,
      applianceSoft: 0x3f4247,
      applianceDark: 0x15171a,
    },
    applianceCombo({
      body: { surface: 'lacquer', color: 0x2a2c30 },
      screen: { surface: 'lacquer', color: 0x15171a },
      metal: { surface: 'metal', color: 0x3f4247 },
    }),
  ),
  definePreset(
    'screen-silver',
    '银灰',
    'metal',
    {
      appliance: 0xb9bec4,
      applianceSoft: 0xc6cbd1,
      applianceDark: 0x6d747b,
    },
    applianceCombo({
      body: { surface: 'metal', color: 0xb9bec4 },
      screen: { surface: 'lacquer', color: 0x15171a },
      metal: { surface: 'metal', color: 0x8c8f94 },
    }),
  ),
])

export const POOL_TABLE_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'pool-cloth-green',
    '经典绿绒',
    'fabric',
    { wood: 0x6b4526, woodLight: 0x855c36, woodDark: 0x4a2e1a },
    poolTableCombo({
      frame: { surface: 'wood', color: 0x6b4526 },
      fabric: { surface: 'fabric', color: 0x2f6b3a },
    }),
  ),
  definePreset(
    'pool-cloth-blue',
    '湖蓝绒',
    'fabric',
    { wood: 0x6b4526, woodLight: 0x855c36, woodDark: 0x4a2e1a },
    poolTableCombo({
      frame: { surface: 'wood', color: 0x6b4526 },
      fabric: { surface: 'fabric', color: 0x2c5a7a },
    }),
  ),
  definePreset(
    'pool-cloth-red',
    '酒红绒',
    'fabric',
    { wood: 0x5a3a22, woodLight: 0x74492b, woodDark: 0x3d2716 },
    poolTableCombo({
      frame: { surface: 'wood', color: 0x5a3a22 },
      fabric: { surface: 'fabric', color: 0x7a2f34 },
    }),
  ),
  definePreset(
    'pool-cloth-black',
    '石墨黑',
    'lacquer',
    { wood: 0x2e2e30, woodLight: 0x45454a, woodDark: 0x1f1f21 },
    poolTableCombo({
      frame: { surface: 'lacquer', color: 0x2e2e30 },
      fabric: { surface: 'fabric', color: 0x2b2b30 },
    }),
  ),
])

export const SHOWER_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'shower-chrome',
    '铬色清玻',
    'metal',
    { showerMetal: 0xc8ccd0 },
    showerCombo({
      body: { surface: 'metal', color: 0xc8ccd0 },
      metal: { surface: 'metal', color: 0xb4babf },
    }),
  ),
  definePreset(
    'shower-black',
    '哑黑',
    'metal',
    { showerMetal: 0x2e3033 },
    showerCombo({
      body: { surface: 'metal', color: 0x2e3033 },
      metal: { surface: 'metal', color: 0x3c4045 },
    }),
  ),
  definePreset(
    'shower-gold',
    '拉丝金',
    'metal',
    { showerMetal: 0xb08d5a },
    showerCombo({
      body: { surface: 'metal', color: 0xb08d5a },
      metal: { surface: 'metal', color: 0x8a6a3c },
    }),
  ),
  definePreset(
    'shower-white',
    '纯白',
    'paint',
    { showerMetal: 0xe8e5df },
    showerCombo({
      body: { surface: 'paint', color: 0xf2f1ed },
      metal: { surface: 'metal', color: 0xb4babf },
    }),
  ),
])

export const TEA_TABLE_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'tea-natural',
    '原木茶台',
    'wood',
    { wood: 0xc49a6c, woodLight: 0xd8b98f, woodDark: 0x9c6b3f },
    teaTableCombo({
      frame: { surface: 'wood', color: 0xc49a6c },
      panel: { surface: 'wood', color: 0xd8b98f },
      recess: { surface: 'wood', color: 0x8c6b44 },
      ceramic: { surface: 'ceramic', color: 0xece7de },
      accent: { surface: 'wood', color: 0xb08a5e },
    }),
  ),
  definePreset(
    'tea-walnut',
    '胡桃木茶台',
    'wood',
    { wood: 0x6b4526, woodLight: 0x855c36, woodDark: 0x4a2e1a },
    teaTableCombo({
      frame: { surface: 'wood', color: 0x6b4526 },
      panel: { surface: 'wood', color: 0x855c36 },
      recess: { surface: 'wood', color: 0x43301c },
      ceramic: { surface: 'ceramic', color: 0xe6ddcf },
      accent: { surface: 'wood', color: 0x9c6b3f },
    }),
  ),
  definePreset(
    'tea-white-porcelain',
    '乌金白瓷',
    'ceramic',
    { wood: 0x2b2b2e, woodLight: 0x3a3a3c, woodDark: 0x1a1a1c },
    teaTableCombo({
      frame: { surface: 'lacquer', color: 0x2b2b2e },
      panel: { surface: 'lacquer', color: 0x3a3a3c },
      recess: { surface: 'lacquer', color: 0x16181a },
      ceramic: { surface: 'ceramic', color: 0xf7f4ee },
      accent: { surface: 'metal', color: 0x9c9a94 },
    }),
  ),
  definePreset(
    'tea-dark-jade',
    '黑檀青瓷',
    'ceramic',
    { wood: 0x2a2622, woodLight: 0x3a352e, woodDark: 0x16140f },
    teaTableCombo({
      frame: { surface: 'wood', color: 0x2a2622 },
      panel: { surface: 'wood', color: 0x3a352e },
      recess: { surface: 'wood', color: 0x16140f },
      ceramic: { surface: 'ceramic', color: 0x9fb8ab },
      accent: { surface: 'ceramic', color: 0x6f8a7c },
    }),
  ),
])

export const ORNAMENT_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'ornament-white',
    '素白纸感',
    'paint',
    { furniture: 0xf2efe8, furnitureLight: 0xfbfaf7, furnitureDark: 0xd8d4cb, leafColor: 0x5f8c4d },
    ornamentCombo({
      base: { surface: 'paint', color: 0xf2efe8 },
      light: { surface: 'paint', color: 0xfbfaf7 },
      dark: { surface: 'paint', color: 0xd8d4cb },
      accent: { surface: 'ceramic', color: 0xc7c2b8 },
      leaf: { surface: 'foliage', color: 0x5f8c4d },
    }),
  ),
  definePreset(
    'ornament-black',
    '墨黑陶',
    'ceramic',
    { furniture: 0x2e2e30, furnitureLight: 0x45454a, furnitureDark: 0x1a1a1c, leafColor: 0x4a6b3f },
    ornamentCombo({
      base: { surface: 'ceramic', color: 0x2e2e30 },
      light: { surface: 'ceramic', color: 0x45454a },
      dark: { surface: 'ceramic', color: 0x1a1a1c },
      accent: { surface: 'metal', color: 0x8c8f94 },
      leaf: { surface: 'foliage', color: 0x4a6b3f },
    }),
  ),
  definePreset(
    'ornament-terra',
    '暖木陶',
    'ceramic',
    {
      furniture: 0xc07a52,
      furnitureLight: 0xd99a72,
      furnitureDark: 0x8c5236,
      leafColor: 0x6f7a45,
      decorAccent: 0xb0a68c,
    },
    ornamentCombo({
      base: { surface: 'ceramic', color: 0xc07a52 },
      light: { surface: 'ceramic', color: 0xd99a72 },
      dark: { surface: 'ceramic', color: 0x8c5236 },
      accent: { surface: 'ceramic', color: 0xb0a68c },
      leaf: { surface: 'foliage', color: 0x6f7a45 },
    }),
  ),
  definePreset(
    'ornament-celadon',
    '青瓷',
    'ceramic',
    { furniture: 0x9fb8ab, furnitureLight: 0xc2d4c9, furnitureDark: 0x6f8a7c, leafColor: 0x7a8c4a },
    ornamentCombo({
      base: { surface: 'ceramic', color: 0x9fb8ab },
      light: { surface: 'ceramic', color: 0xc2d4c9 },
      dark: { surface: 'ceramic', color: 0x6f8a7c },
      accent: { surface: 'ceramic', color: 0xe6ddcf },
      leaf: { surface: 'foliage', color: 0x7a8c4a },
    }),
  ),
])
