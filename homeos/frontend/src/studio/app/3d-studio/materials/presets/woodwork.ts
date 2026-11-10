/** 档位表：柜体木作、立柱与木质家具。 */

import type { MaterialSurface } from '../studio-model-material-roles'
import { joineryCombo, pillarCombo, woodCombo } from './preset-combos'
import type { MaterialStylePreset } from './preset-core'
import { definePreset } from './preset-core'

/** 「木柜白门」的白门色：一支暖白，**刻意不是纯白**。 */
const JOINERY_WHITE_DOOR_COLOR = 0xe9e4da

/** 柜类四档的「柜体 / 柜面」两支料。 */
const JOINERY_TONE_BY_STYLE = Object.freeze({
  'joinery-wood-white': Object.freeze({
    body: Object.freeze({ surface: 'wood' as MaterialSurface, color: 0x3d2818 }),
    door: Object.freeze({
      surface: 'lacquer' as MaterialSurface,
      color: JOINERY_WHITE_DOOR_COLOR,
    }),
  }),
  'joinery-oak': Object.freeze({
    body: Object.freeze({ surface: 'wood' as MaterialSurface, color: 0xc49a6c }),
    door: Object.freeze({ surface: 'wood' as MaterialSurface, color: 0xd8b98f }),
  }),
  'joinery-walnut': Object.freeze({
    body: Object.freeze({ surface: 'wood' as MaterialSurface, color: 0x5a3a22 }),
    door: Object.freeze({ surface: 'wood' as MaterialSurface, color: 0x6b4526 }),
  }),
  'joinery-lacquer': Object.freeze({
    body: Object.freeze({ surface: 'lacquer' as MaterialSurface, color: 0x2e2a28 }),
    door: Object.freeze({ surface: 'lacquer' as MaterialSurface, color: 0x3a3a3c }),
  }),
})

/** 「木柜白门」的门料自发光：白门在默认档的暗场里**必须自己撑住白度**。 */
const JOINERY_WHITE_DOOR_GLOW = Object.freeze({
  emissive: JOINERY_WHITE_DOOR_COLOR,
  emissiveIntensity: 0.6,
})

export const JOINERY_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'joinery-wood-white',
    '木柜白门',
    'wood',
    {
      cabinetWood: 0x3d2818,
      cabinetBody: 0x3d2818,

      cabinetDoor: JOINERY_WHITE_DOOR_COLOR,
      furniture: 0xc49a6c,
      furnitureSoft: 0xc49a6c,
      furnitureDark: 0x3d2818,
      countertop: 0xf2f1ed,
    },
    joineryCombo({
      body: JOINERY_TONE_BY_STYLE['joinery-wood-white'].body,

      door: Object.freeze({
        ...JOINERY_TONE_BY_STYLE['joinery-wood-white'].door,
        ...JOINERY_WHITE_DOOR_GLOW,
      }),
      top: { surface: 'stone', color: 0xf2f1ed },
      metal: { surface: 'metal', color: 0x9aa1a8 },
    }),
  ),
  definePreset(
    'joinery-oak',
    '浅橡木',
    'wood',
    {
      cabinetWood: 0xc49a6c,
      cabinetBody: 0xc49a6c,
      cabinetDoor: 0xd8b98f,
      furniture: 0xc49a6c,
      furnitureSoft: 0xd8b98f,
      furnitureDark: 0x9c6b3f,
      countertop: 0xede7db,
    },
    joineryCombo({
      body: JOINERY_TONE_BY_STYLE['joinery-oak'].body,
      door: JOINERY_TONE_BY_STYLE['joinery-oak'].door,
      top: { surface: 'stone', color: 0xede7db },
      metal: { surface: 'metal', color: 0x8c8f94 },
    }),
  ),
  definePreset(
    'joinery-walnut',
    '胡桃木',
    'wood',
    {
      cabinetWood: 0x5a3a22,
      cabinetBody: 0x5a3a22,
      cabinetDoor: 0x6b4526,
      furniture: 0x6b4526,
      furnitureSoft: 0x855c36,
      furnitureDark: 0x3f2916,
      countertop: 0x2b2b2e,
    },
    joineryCombo({
      body: JOINERY_TONE_BY_STYLE['joinery-walnut'].body,
      door: JOINERY_TONE_BY_STYLE['joinery-walnut'].door,
      top: { surface: 'stone', color: 0x2b2b2e },
      metal: { surface: 'metal', color: 0x2e2e30 },
    }),
  ),
  definePreset(
    'joinery-lacquer',
    '深色烤漆',
    'lacquer',
    {
      cabinetWood: 0x2e2a28,
      cabinetBody: 0x2e2a28,
      cabinetDoor: 0x3a3a3c,
      furniture: 0x3a3a3c,
      furnitureSoft: 0x4d4d50,
      furnitureDark: 0x1f1f21,
      countertop: 0x2b2b2e,
    },
    joineryCombo({
      body: JOINERY_TONE_BY_STYLE['joinery-lacquer'].body,
      door: JOINERY_TONE_BY_STYLE['joinery-lacquer'].door,
      top: { surface: 'stone', color: 0x2b2b2e },
      metal: { surface: 'metal', color: 0x44484d },
    }),
  ),
])

export const PILLAR_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'pillar-joinery-wood-white',
    '木柜白门（配柜）',
    'wood',
    {
      cabinetBody: JOINERY_TONE_BY_STYLE['joinery-wood-white'].body.color,
      cabinetDoor: JOINERY_TONE_BY_STYLE['joinery-wood-white'].door.color,
    },
    pillarCombo({
      body: JOINERY_TONE_BY_STYLE['joinery-wood-white'].door,
      base: JOINERY_TONE_BY_STYLE['joinery-wood-white'].body,
      trim: JOINERY_TONE_BY_STYLE['joinery-wood-white'].body,
    }),
  ),
  definePreset(
    'pillar-joinery-oak',
    '浅橡木（配柜）',
    'wood',
    {
      cabinetBody: JOINERY_TONE_BY_STYLE['joinery-oak'].body.color,
      cabinetDoor: JOINERY_TONE_BY_STYLE['joinery-oak'].door.color,
    },
    pillarCombo({
      body: JOINERY_TONE_BY_STYLE['joinery-oak'].door,
      base: JOINERY_TONE_BY_STYLE['joinery-oak'].body,
      trim: JOINERY_TONE_BY_STYLE['joinery-oak'].body,
    }),
  ),
  definePreset(
    'pillar-joinery-walnut',
    '胡桃木（配柜）',
    'wood',
    {
      cabinetBody: JOINERY_TONE_BY_STYLE['joinery-walnut'].body.color,
      cabinetDoor: JOINERY_TONE_BY_STYLE['joinery-walnut'].door.color,
    },
    pillarCombo({
      body: JOINERY_TONE_BY_STYLE['joinery-walnut'].door,
      base: JOINERY_TONE_BY_STYLE['joinery-walnut'].body,
      trim: JOINERY_TONE_BY_STYLE['joinery-walnut'].body,
    }),
  ),
  definePreset(
    'pillar-joinery-lacquer',
    '深色烤漆（配柜）',
    'lacquer',
    {
      cabinetBody: JOINERY_TONE_BY_STYLE['joinery-lacquer'].body.color,
      cabinetDoor: JOINERY_TONE_BY_STYLE['joinery-lacquer'].door.color,
    },
    pillarCombo({
      body: JOINERY_TONE_BY_STYLE['joinery-lacquer'].door,
      base: JOINERY_TONE_BY_STYLE['joinery-lacquer'].body,
      trim: JOINERY_TONE_BY_STYLE['joinery-lacquer'].body,
    }),
  ),
])

export const WOOD_FURNITURE_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'wood-natural',
    '原木本色',
    'wood',
    {
      wood: 0xc49a6c,
      woodLight: 0xd8b98f,
      woodDark: 0x9c6b3f,
      furniture: 0xc49a6c,
      furnitureSoft: 0xd8b98f,
      furnitureDark: 0x9c6b3f,
    },
    woodCombo({
      top: { surface: 'wood', color: 0xc49a6c },
      leg: { surface: 'wood', color: 0xbc9163 },
      drawer: { surface: 'wood', color: 0xd8b98f },
      trim: { surface: 'wood', color: 0x9c6b3f },
      metal: { surface: 'metal', color: 0x8c8f94 },
    }),
  ),
  definePreset(
    'wood-walnut',
    '胡桃木',
    'wood',
    {
      wood: 0x6b4526,
      woodLight: 0x855c36,
      woodDark: 0x4a2e1a,
      furniture: 0x6b4526,
      furnitureSoft: 0x855c36,
      furnitureDark: 0x4a2e1a,
    },
    woodCombo({
      top: { surface: 'wood', color: 0x6b4526 },
      leg: { surface: 'wood', color: 0x5f3d21 },
      drawer: { surface: 'wood', color: 0x855c36 },
      trim: { surface: 'wood', color: 0x4a2e1a },
      metal: { surface: 'metal', color: 0x3a3a3c },
    }),
  ),
  definePreset(
    'wood-white-lacquer',
    '白色烤漆',
    'lacquer',
    {
      wood: 0xf5f3ef,
      woodLight: 0xfbfaf8,
      woodDark: 0xdcd8d2,
      furniture: 0xf5f3ef,
      furnitureSoft: 0xfbfaf8,
      furnitureDark: 0xdcd8d2,
    },
    woodCombo({
      top: { surface: 'lacquer', color: 0xf5f3ef },
      leg: { surface: 'lacquer', color: 0xefece6 },
      drawer: { surface: 'lacquer', color: 0xfbfaf8 },
      trim: { surface: 'lacquer', color: 0xdcd8d2 },
      metal: { surface: 'metal', color: 0xb4babf },
    }),
  ),
  definePreset(
    'wood-black-metal',
    '黑砂金属腿',
    'metal',
    {
      wood: 0x3a3a3c,
      woodLight: 0x55555a,
      woodDark: 0x242426,
      furniture: 0x3a3a3c,
      furnitureSoft: 0x55555a,
      furnitureDark: 0x242426,
    },
    woodCombo({
      top: { surface: 'wood', color: 0x6b4526 },
      leg: { surface: 'metal', color: 0x2e2e30 },
      drawer: { surface: 'wood', color: 0x855c36 },
      trim: { surface: 'metal', color: 0x303034 },
      metal: { surface: 'metal', color: 0x2e2e30 },
    }),
  ),
])
