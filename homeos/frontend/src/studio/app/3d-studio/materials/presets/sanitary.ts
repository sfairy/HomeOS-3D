/** 档位表：陶瓷洁具、台盆与玻璃。 */

import { glazingCombo, sanitaryCombo } from './preset-combos'
import type { MaterialStylePreset } from './preset-core'
import { definePreset } from './preset-core'
import { STONE_SLAB_ON_DARK, STONE_SLAB_ON_WHITE } from './stone'

/**
 * 洁具档位：除了池体 / 台面 / 木作，必须同时下料**五金与织物**（`showerMetal` / `diningLinen`）——
 * 洁具组里毛巾杆（`rack`）、龙头（`faucet` 由 `metal`/`trim` 派生）、毛巾（`towel`）都读这两个语义键；
 * 不写就等于让这些构件永远停在主题默认色，整机只有池体换色（`shower` / `poolTable` 档位早就这么做了）。
 */
export const CERAMIC_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'ceramic-glossy',
    '亮白陶瓷',
    'ceramic',
    {
      applianceSoft: 0xfbfbf9,
      furnitureLight: 0xfbfbf9,
      furniture: 0xf0f0ec,
      /* 洁具五金 / 毛巾：`sanitaryCombo` 与 `ceramic` 组配方都读这两个键（见上面的组注释）。 */
      showerMetal: 0xbfc6cc,
      diningLinen: 0xe3ded4,
    },
    sanitaryCombo({
      body: { surface: 'ceramic', color: 0xf7f7f4 },
      top: { surface: 'marble', color: 0xf2f1ed },
      frame: { surface: 'wood', color: 0xc9a67c },
      door: { surface: 'wood', color: 0xd4b48c },
    }),
  ),
  definePreset(
    'ceramic-matte',
    '哑光石白',
    'ceramic',
    {
      applianceSoft: 0xedebe4,
      furnitureLight: 0xedebe4,
      furniture: 0xdedbd2,
      showerMetal: 0xa9b0b7,
      diningLinen: 0xdcd6ca,
    },
    sanitaryCombo({
      body: { surface: 'ceramic', color: 0xeceae2 },
      top: { surface: 'stone', color: 0xdcd8cf },
      frame: { surface: 'wood', color: 0xb09374 },
      door: { surface: 'wood', color: 0xbea184 },
    }),
  ),
  definePreset(
    'ceramic-stone-grey',
    '岩灰',
    'stone',
    {
      applianceSoft: 0xc8c6c0,
      furnitureLight: 0xc8c6c0,
      furniture: 0xb6b4ae,
      showerMetal: 0x8b9299,
      diningLinen: 0xc9c3b8,
    },
    sanitaryCombo({
      body: { surface: 'stone', color: 0xc2c0ba },
      top: { surface: 'stone', color: 0xa9a8a3 },
      frame: { surface: 'paint', color: 0x6f7276 },
      door: { surface: 'paint', color: 0x7c8085 },
    }),
  ),
])

/** 复用另一组的档位：换掉 id，配方原样带走。 */
function reusePresetInGroup(preset: MaterialStylePreset, id: string): MaterialStylePreset {
  return Object.freeze({ ...preset, id })
}

/** 台盆的台面档位：整张石材。 */
const BASIN_STONE_TOP_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'basin-marble-white',
    '白色大理石台面',
    'marble',
    {
      countertop: 0xf2f1ed,
      applianceSoft: 0xfbfbf9,
      furniture: 0xf0f0ec,
    },
    sanitaryCombo({
      body: { surface: 'ceramic', color: 0xfbfbf9 },
      sink: { surface: 'ceramic', color: 0xf7f7f4 },
      top: STONE_SLAB_ON_WHITE,
      frame: { surface: 'wood', color: 0xc9a67c },
    }),
  ),

  definePreset(
    'basin-marble-black',
    '黑色大理石台面',
    'stone',
    {
      countertop: 0x1e2023,
      applianceSoft: 0xfbfbf9,
      furniture: 0x2a2c30,
    },
    sanitaryCombo({
      body: { surface: 'ceramic', color: 0xfbfbf9 },
      sink: { surface: 'ceramic', color: 0xf7f7f4 },
      top: STONE_SLAB_ON_DARK,
      frame: { surface: 'wood', color: 0x6b4a30 },
    }),
  ),
])

/** 台盆档位组：洁具三档（换 id 复用）+ 两块石材台面。 */
export const BASIN_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  ...CERAMIC_STYLES.map((preset) => reusePresetInGroup(preset, `basin-${preset.id}`)),
  ...BASIN_STONE_TOP_STYLES,
])

export const GLASS_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'glass-clear',
    '清玻',
    'glass',
    { glass: 0xdfeaec },
    glazingCombo({
      glass: { surface: 'glass', color: 0xdfeaec },
      frame: { surface: 'metal', color: 0xb4babf },
    }),
  ),
  definePreset(
    'glass-tinted',
    '茶玻',
    'glass',
    { glass: 0xc9b18c },
    glazingCombo({
      glass: { surface: 'glass', color: 0xc9b18c },
      frame: { surface: 'metal', color: 0xa08558 },
    }),
  ),
])
