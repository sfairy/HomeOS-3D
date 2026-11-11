/** 档位表：灯具、摆件、地毯与窗帘。 */

import { applianceCombo, curtainCombo, plantCombo, rugCombo } from './preset-combos'
import type { MaterialStylePreset } from './preset-core'
import { definePreset } from './preset-core'

export const LAMP_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'lamp-warm-brass',
    '暖铜',
    'metal',
    {
      floorLampBody: 0x9c6b3f,
      appliance: 0xb8a48c,
      applianceSoft: 0xd8cdbe,
      applianceDark: 0x6b4a2e,
      furniture: 0xb8a48c,
      furnitureSoft: 0xd8cdbe,
    },
    applianceCombo({
      body: { surface: 'metal', color: 0x9c6b3f },
      metal: { surface: 'metal', color: 0x8a5c33 },
      trim: { surface: 'metal', color: 0x8a5c33 },

      base: { surface: 'metal', color: 0x2e2e30 },
      lit: { surface: 'fabric', color: 0xf0e6d4 },
    }),
  ),
  definePreset(
    'lamp-black',
    '哑黑',
    'metal',
    {
      floorLampBody: 0x2e2e30,
      appliance: 0x3c3f44,
      applianceSoft: 0x565a61,
      applianceDark: 0x22252a,
      furniture: 0x3c3f44,
      furnitureSoft: 0x565a61,
    },
    applianceCombo({
      body: { surface: 'metal', color: 0x2e2e30 },
      metal: { surface: 'metal', color: 0x3c3f44 },
      trim: { surface: 'metal', color: 0x3c3f44 },
      base: { surface: 'metal', color: 0x22252a },
      lit: { surface: 'fabric', color: 0xefe9dd },
    }),
  ),
  definePreset(
    'lamp-white',
    '瓷白',
    'paint',
    {
      floorLampBody: 0xe8e5df,
      appliance: 0xf3f1ec,
      applianceSoft: 0xfbfaf8,
      applianceDark: 0xc9c2b4,
      furniture: 0xf3f1ec,
      furnitureSoft: 0xfbfaf8,
    },
    applianceCombo({
      body: { surface: 'paint', color: 0xf3f1ec },
      metal: { surface: 'metal', color: 0xb4babf },
      trim: { surface: 'metal', color: 0xb4babf },
      base: { surface: 'paint', color: 0xe8e5df },
      lit: { surface: 'fabric', color: 0xfbf8f2 },
    }),
  ),
  definePreset(
    'lamp-walnut',
    '胡桃木',
    'wood',
    {
      floorLampBody: 0x6b4526,
      appliance: 0x8a6238,
      applianceSoft: 0xa9885c,
      applianceDark: 0x4a3018,
      furniture: 0x8a6238,
      furnitureSoft: 0xa9885c,
    },
    applianceCombo({
      body: { surface: 'wood', color: 0x6b4526 },
      metal: { surface: 'metal', color: 0x9c6b3f },
      trim: { surface: 'metal', color: 0x9c6b3f },
      base: { surface: 'metal', color: 0x2e2e30 },
      lit: { surface: 'fabric', color: 0xfaf2e4 },
    }),
  ),
])

export const DECOR_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'decor-fresh-green',
    '鲜绿',
    'foliage',
    {
      leafColor: 0x5d8c40,
      decorAccent: 0xc4a484,
      furnitureDark: 0x6b4a2e,
    },
    plantCombo({
      foliage: { surface: 'foliage', color: 0x5d8c40 },
      pot: { surface: 'ceramic', color: 0xc4a484 },
      flower: { surface: 'paint', color: 0xe6a8bd },
    }),
  ),
  definePreset(
    'decor-olive',
    '橄榄绿',
    'foliage',
    {
      leafColor: 0x6f7a45,
      decorAccent: 0xb0a68c,
      furnitureDark: 0x5a5344,
    },
    plantCombo({
      foliage: { surface: 'foliage', color: 0x6f7a45 },
      pot: { surface: 'ceramic', color: 0xb0a68c },
      flower: { surface: 'paint', color: 0xf2ead6 },
    }),
  ),
  definePreset(
    'decor-terra',
    '陶盆暖调',
    'foliage',
    {
      leafColor: 0x7a8c4a,
      decorAccent: 0xc07a52,
      furnitureDark: 0x8c5a3c,
    },
    plantCombo({
      foliage: { surface: 'foliage', color: 0x7a8c4a },

      pot: { surface: 'ceramic', color: 0xc07a52 },
      trunk: { surface: 'wood', color: 0x8c5a3c },
      flower: { surface: 'paint', color: 0xd98a63 },
    }),
  ),
])

export const RUG_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'rug-neutral',
    '中性米',
    'fabric',
    {
      joineryAccent: 0xe4d5c2,
      furnitureLight: 0xf3e7d8,
      furnitureDark: 0xb9a894,
    },
    rugCombo({ fabric: { surface: 'fabric', color: 0xe4d5c2 } }),
  ),
  definePreset(
    'rug-grey',
    '素灰',
    'fabric',
    {
      joineryAccent: 0xc7c5bf,
      furnitureLight: 0xdedcd6,
      furnitureDark: 0x9c9a94,
    },
    rugCombo({ fabric: { surface: 'fabric', color: 0xc7c5bf } }),
  ),
  definePreset(
    'rug-pattern',
    '花色织纹',
    'fabric',
    {
      joineryAccent: 0xb98d73,
      furnitureLight: 0xd8b49c,
      furnitureDark: 0x8c5f45,
    },
    rugCombo({
      fabric: { surface: 'fabric', color: 0xd8b49c },

      trim: { surface: 'fabric', color: 0x7a4a34 },
    }),
  ),
])

export const CURTAIN_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'curtain-warm-white',
    '暖米白',
    'fabric',
    {
      rollerCurtain: 0xf0e8dc,
      furnitureDark: 0x6b4a2e,
      furnitureSoft: 0xe4d5c2,
    },
    curtainCombo({ fabric: { surface: 'fabric', color: 0xf0e8dc } }),
  ),
  definePreset(
    'curtain-linen',
    '亚麻灰',
    'fabric',
    {
      rollerCurtain: 0xd5d2ca,
      furnitureDark: 0x5a5344,
      furnitureSoft: 0xc2bfb7,
    },
    curtainCombo({ fabric: { surface: 'fabric', color: 0xd5d2ca } }),
  ),
  definePreset(
    'curtain-deep-green',
    '深墨绿',
    'fabric',
    {
      rollerCurtain: 0x4a5c4a,
      furnitureDark: 0x2e3a2e,
      furnitureSoft: 0x6b7d6b,
    },
    curtainCombo({
      fabric: { surface: 'fabric', color: 0x4a5c4a },

      metal: { surface: 'metal', color: 0xb4babf },
    }),
  ),
])
