/** 档位表：大理石桌面与石材台面。 */

import { stoneCombo } from './preset-combos'
import type { MaterialStylePreset } from './preset-core'
import { definePreset } from './preset-core'

export const STONE_SLAB_ON_WHITE = Object.freeze({
  slab: 'marble' as const,
  color: 0xffffff,
  roughness: 0.24,
  metalness: 0.03,
})
export const STONE_SLAB_ON_DARK = Object.freeze({
  slab: 'marble-dark' as const,
  color: 0xffffff,
  roughness: 0.18,
  metalness: 0.04,
})
/** 普通石作台面（岩板 / 水磨石…）：走石材的哑光面，**不**贴大理石整图。 */
const STONE_PLAIN_STONE = Object.freeze({
  surface: 'stone' as const,
  color: 'countertop',
})

const MARBLE_TABLE_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'stone-white-black',
    '白石黑座',
    'marble',
    {
      countertop: 0xf2f1ed,
      furniture: 0xf2f1ed,
      furnitureSoft: 0xe3e2dd,
      furnitureDark: 0x1e2023,
    },
    stoneCombo({ top: STONE_SLAB_ON_WHITE, base: STONE_SLAB_ON_DARK }),
  ),
  definePreset(
    'stone-all-white',
    '全白大理石',
    'marble',
    {
      countertop: 0xf4f3ef,
      furniture: 0xf4f3ef,
      furnitureSoft: 0xe6e5e0,
      furnitureDark: 0xd2d0c9,
    },
    stoneCombo({
      top: STONE_SLAB_ON_WHITE,
      base: { ...STONE_SLAB_ON_WHITE, color: 0xd9d8d3 },
    }),
  ),
  definePreset(
    'stone-all-black',
    '全黑大理石',
    'stone',
    {
      countertop: 0x1e2023,
      furniture: 0x1e2023,
      furnitureSoft: 0x33363a,
      furnitureDark: 0x121315,
    },
    stoneCombo({
      top: STONE_SLAB_ON_DARK,
      base: { ...STONE_SLAB_ON_DARK, color: 0xd2d6dd },
    }),
  ),
  definePreset(
    'stone-travertine',
    '米黄洞石',
    'stone',
    {
      countertop: 0xdcd0b8,
      furniture: 0xdcd0b8,
      furnitureSoft: 0xe8ddc8,
      furnitureDark: 0xbfae92,
    },
    stoneCombo({
      top: { surface: 'stone', color: 0xdcd0b8 },
      base: { surface: 'stone', color: 0xc4b294 },
    }),
  ),
])

const STONE_TOP_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'stone-marble',
    '白色大理石',
    'marble',
    { countertop: 0xf2f1ed },
    {
      top: STONE_SLAB_ON_WHITE,
      surface: STONE_SLAB_ON_WHITE,
      slab: STONE_SLAB_ON_WHITE,
    },
  ),

  definePreset(
    'stone-black',
    '黑色岩板',
    'stone',
    { countertop: 0x2b2b2e },
    {
      top: STONE_PLAIN_STONE,
      surface: STONE_PLAIN_STONE,
      slab: STONE_PLAIN_STONE,
    },
  ),
  definePreset(
    'stone-terrazzo',
    '水磨石',
    'stone',
    { countertop: 0xdcd8cf },
    {
      top: STONE_PLAIN_STONE,
      surface: STONE_PLAIN_STONE,
      slab: STONE_PLAIN_STONE,
    },
  ),
])

/** 石材类家具（茶几 / 岛台）的完整档位表：整件石作四档 + 只换台面三档。 */
export const STONE_FURNITURE_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  ...MARBLE_TABLE_STYLES,
  ...STONE_TOP_STYLES,
])
