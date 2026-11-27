/** 档位表：布艺与皮革软包。 */

import { fabricCombo } from './preset-combos'
import type { MaterialStylePreset } from './preset-core'
import { definePreset } from './preset-core'

const FABRIC_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'fabric-warm',
    '暖白布艺',
    'fabric',
    {
      furnitureLight: 0xf3e7d8,
      furnitureSoft: 0xe4d5c2,
      sofaFabric: 0xf3e7d8,
      diningLinen: 0xf3e7d8,
    },
    fabricCombo({
      upholstery: { surface: 'fabric', color: 0xf3e7d8 },
      leg: { surface: 'wood', color: 0xb08a5e },
      accent: { surface: 'fabric', color: 0xc09a6e },
    }),
  ),
  definePreset(
    'linen-grey',
    '亚麻灰',
    'fabric',
    {
      furnitureLight: 0xd9d7d0,
      furnitureSoft: 0xb9b6ad,
      sofaFabric: 0xd9d7d0,
      diningLinen: 0xd9d7d0,
    },
    fabricCombo({
      upholstery: { surface: 'fabric', color: 0xd9d7d0 },
      leg: { surface: 'wood', color: 0x9c6b3f },
      accent: { surface: 'fabric', color: 0x8f8b82 },
    }),
  ),
  definePreset(
    'sage-mist',
    '雾霾绿',
    'fabric',
    {
      furnitureLight: 0xcbd6c4,
      furnitureSoft: 0xa8b79e,
      sofaFabric: 0xcbd6c4,
      diningSage: 0xa8b79e,
    },
    fabricCombo({
      upholstery: { surface: 'fabric', color: 0xcbd6c4 },
      leg: { surface: 'wood', color: 0xa9814f },

      accent: { surface: 'fabric', color: 0xc2a184 },
    }),
  ),
  definePreset(
    'clay-terracotta',
    '陶土棕',
    'fabric',
    {
      furnitureLight: 0xd8b49c,
      furnitureSoft: 0xb98d73,
      sofaFabric: 0xd8b49c,
    },
    fabricCombo({
      upholstery: { surface: 'fabric', color: 0xd8b49c },
      leg: { surface: 'metal', color: 0x3a3a3c },
      accent: { surface: 'fabric', color: 0xa8765a },
    }),
  ),
])

const LEATHER_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'leather-tan',
    '焦糖皮',
    'leather',
    {
      furnitureLight: 0xc98a52,
      furnitureSoft: 0xb0703c,
      sofaFabric: 0xb0703c,
    },
    fabricCombo({
      upholstery: { surface: 'leather', color: 0xb0703c },
      leg: { surface: 'metal', color: 0x3a3a3c },

      accent: { surface: 'leather', color: 'furnitureLight' },
    }),
  ),
  definePreset(
    'leather-cognac',
    '干邑棕',
    'leather',
    {
      furnitureLight: 0xa75c2c,
      furnitureSoft: 0x8c4a22,
      sofaFabric: 0x8c4a22,
    },
    fabricCombo({
      upholstery: { surface: 'leather', color: 0x8c4a22 },
      leg: { surface: 'metal', color: 0x2e2e30 },
      accent: { surface: 'leather', color: 'furnitureLight' },
    }),
  ),
  definePreset(
    'leather-black',
    '墨黑皮',
    'leather',
    {
      furnitureLight: 0x3c3a38,
      furnitureSoft: 0x262422,
      sofaFabric: 0x262422,
    },
    fabricCombo({
      upholstery: { surface: 'leather', color: 0x262422 },
      leg: { surface: 'metal', color: 0x2e2e30 },

      frame: { surface: 'wood', color: 0x3a2418 },

      accent: { surface: 'leather', color: 'furnitureLight' },
    }),
  ),
])

/** 软装座具：布艺四档 + 皮革三档并成一组，一个下拉里都能选。 */
export const UPHOLSTERY_STYLES: readonly MaterialStylePreset[] = Object.freeze([...FABRIC_STYLES, ...LEATHER_STYLES])
