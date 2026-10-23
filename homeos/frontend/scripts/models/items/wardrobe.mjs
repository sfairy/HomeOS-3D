/**
 * `wardrobe`（1800 × 2200 × 637 mm 双门衣柜）参数化重建。
 *
 * 槽位：0 柜体 / 1 门板 / 2 踢脚阴影 / 3 拉手。
 * 原模型门板与柜体共面，缝隙和拉手全靠贴图，深度也只有 0.4m。
 */
import { cylinder, merge, transform } from '../lib/primitive-kit.mjs'
import { b, carcassBox } from '../lib/parts.mjs'

export const spec = { size: [1.8, 2.2, 0.637], mount: 'floor', topologyClass: 'solid' }

const W = 1.8
const H = 2.2
const D = 0.637
const PLINTH = 0.09
const PANEL = 0.018
const TOP = 0.022
const BODY_D = 0.59
const BODY_TOP = H - TOP
const FRONT_Z = BODY_D / 2
const DOOR_T = 0.02

const plinth = b(W - 0.1, PLINTH, BODY_D - 0.05, 0, PLINTH / 2, -0.01)
const carcass = carcassBox({
  width: W,
  height: BODY_TOP - PLINTH,
  depth: BODY_D,
  center: [0, (BODY_TOP + PLINTH) / 2, 0],
  panel: PANEL,
})
const shelves = merge(
  [0.62, 1.32, 1.92].map((height) => b(W - PANEL * 2, PANEL, BODY_D - 0.03, 0, height, 0)),
)
const topSlab = b(W, TOP, BODY_D, 0, H - TOP / 2, 0)

const doors = merge(
  [-1, 1].map((side) =>
    b(W / 2 - 0.006, BODY_TOP - PLINTH - 0.006, DOOR_T, (side * W) / 4, (BODY_TOP + PLINTH) / 2, FRONT_Z + DOOR_T / 2),
  ),
)
const handles = merge(
  [-1, 1].map((side) =>
    transform(cylinder({ radiusTop: 0.009, height: 0.34, segments: 10 }), {
      translate: [side * 0.06, 1.22, FRONT_Z + DOOR_T + 0.018],
    }),
  ),
)

export function build() {
  return {
    groups: [
      { name: 'wardrobe-frame', material: 0, geometry: merge([plinth, carcass, shelves, topSlab]) },
      { name: 'wardrobe-panel', material: 1, geometry: doors },
      { name: 'wardrobe-shadow', material: 2, geometry: b(W, 0.004, D, 0, 0.002, (D - BODY_D) / 2) },
      { name: 'wardrobe-handle', material: 3, geometry: handles },
    ],
  }
}
