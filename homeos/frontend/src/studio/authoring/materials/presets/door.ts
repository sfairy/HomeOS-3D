/** 档位表：门。 */

import type { Recipe } from './preset-combos'
import type { MaterialStylePreset } from './preset-core'
import { definePreset } from './preset-core'

/** 门：门框 / 门扇 / 玻璃 / 五金 / 卷帘 / 帘片 / 装饰线（角色见 `MODEL_SLOT_ROLES.door`）。 */
function doorCombo(roles: Record<string, Recipe>): Record<string, Recipe> {
  return roles
}

/** 门玻璃：与主题玻璃同一档通透度（面板与画面同源，别在这里另编一个数值）。 */
const DOOR_GLASS_RECIPE: Recipe = Object.freeze({
  surface: 'glass',
  color: 'glass',
  transparent: true,
  opacity: 0.34,
  depthWrite: false,
})

export const DOOR_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    'door-white-lacquer',
    '白色烤漆门',
    'lacquer',
    {
      doorFrame: 0xf5f3ef,
      doorLeaf: 0xf7f5f1,
      furnitureDark: 0xcdc8c0,
    },
    doorCombo({
      frame: { surface: 'lacquer', color: 0xf5f3ef },
      door: { surface: 'lacquer', color: 0xf7f5f1 },
      metal: { surface: 'metal', color: 0xb4babf },

      glass: DOOR_GLASS_RECIPE,

      shutter: { surface: 'fabric', color: 0xe9e5df },
      slat: { surface: 'metal', color: 0xd3cfc8 },

      trim: { surface: 'lacquer', color: 0xdcd8d2 },
    }),
  ),
  definePreset(
    'door-natural-oak',
    '原木门',
    'wood',
    {
      doorFrame: 0xc49a6c,
      doorLeaf: 0xd8b98f,
      furnitureDark: 0x9c6b3f,
    },
    doorCombo({
      frame: { surface: 'wood', color: 0xc49a6c },
      door: { surface: 'wood', color: 0xd8b98f },
      metal: { surface: 'metal', color: 0x8c8f94 },
      glass: DOOR_GLASS_RECIPE,
      shutter: { surface: 'fabric', color: 0xdcc7a6 },
      slat: { surface: 'metal', color: 0xb39a78 },
      trim: { surface: 'wood', color: 0xb98d5f },
    }),
  ),
  definePreset(
    'door-walnut',
    '胡桃木门',
    'wood',
    {
      doorFrame: 0x6b4526,
      doorLeaf: 0x855c36,
      furnitureDark: 0x4a2e1a,
    },
    doorCombo({
      frame: { surface: 'wood', color: 0x6b4526 },
      door: { surface: 'wood', color: 0x855c36 },
      metal: { surface: 'metal', color: 0x3a3a3c },
      glass: DOOR_GLASS_RECIPE,
      shutter: { surface: 'fabric', color: 0x7c5734 },
      slat: { surface: 'metal', color: 0x5c3d22 },
      trim: { surface: 'wood', color: 0x53381f },
    }),
  ),
  definePreset(
    'door-dark-metal',
    '深灰金属门',
    'metal',
    {
      doorFrame: 0x3a3a3c,
      doorLeaf: 0x46464a,
      furnitureDark: 0x242426,
    },
    doorCombo({
      frame: { surface: 'metal', color: 0x3a3a3c, roughness: 0.42, metalness: 0.45 },
      door: { surface: 'lacquer', color: 0x46464a },
      metal: { surface: 'metal', color: 0x2e2e30 },
      glass: DOOR_GLASS_RECIPE,
      shutter: { surface: 'metal', color: 0x3e3e42 },
      slat: { surface: 'metal', color: 0x2a2a2c },
      trim: { surface: 'metal', color: 0x35353a },
    }),
  ),
  definePreset(
    'door-black-frame-glass',
    '黑框玻璃门',
    'glass',
    {
      doorFrame: 0x2a2c30,
      doorLeaf: 0x2a2c30,
      glass: 0xbcd6e0,
      furnitureDark: 0x2e2e30,
    },
    doorCombo({
      frame: { surface: 'metal', color: 0x2a2c30, roughness: 0.4, metalness: 0.5 },

      door: { surface: 'metal', color: 0x2a2c30, roughness: 0.4, metalness: 0.5 },
      glass: DOOR_GLASS_RECIPE,
      metal: { surface: 'metal', color: 0x6d747b },
      shutter: { surface: 'metal', color: 0x2a2c30 },
      slat: { surface: 'metal', color: 0x3a3d42 },
      trim: { surface: 'metal', color: 0x4a4e54 },
    }),
  ),
])
