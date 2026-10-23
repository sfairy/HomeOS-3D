/**
 * `tvstand`（1800 × 480 × 420 mm 双抽电视柜）参数化重建。
 *
 * 槽位：0 柜体框架 / 1 接触阴影 / 2 台面与抽屉面板。
 * 原模型高 480、深 420 的盒子只有 12 个面，抽屉缝与踢脚线全靠贴图。
 */
import { merge } from '../lib/primitive-kit.mjs'
import { b, legs4 } from '../lib/parts.mjs'

export const spec = { size: [1.8, 0.48, 0.42], mount: 'floor', topologyClass: 'solid' }

const W = 1.8
const H = 0.48
const D = 0.42
const PANEL = 0.018
const TOP = 0.02
const PLINTH = 0.06
const BODY_D = D - 0.04
const FRONT_Z = D / 2 - 0.01
const BODY_TOP = H - TOP

const plinth = b(W - 0.16, PLINTH, BODY_D - 0.06, 0, PLINTH / 2, -0.02)
const sides = merge(
  [-1, 1].map((side) =>
    b(PANEL, BODY_TOP - PLINTH, BODY_D, (side * (W - PANEL)) / 2, (BODY_TOP + PLINTH) / 2, -0.02),
  ),
)
const bottom = b(W - PANEL * 2, PANEL, BODY_D - 0.02, 0, PLINTH + PANEL / 2, -0.02)
const back = b(W - PANEL * 2, BODY_TOP - PLINTH, 0.008, 0, (BODY_TOP + PLINTH) / 2, -D / 2 + 0.008)
const divider = b(PANEL, BODY_TOP - PLINTH - PANEL, BODY_D - 0.02, 0, (BODY_TOP + PLINTH) / 2, -0.02)
const shelf = b(W - PANEL * 2, PANEL, BODY_D - 0.02, 0, 0.26, -0.02)

const topSlab = b(W, TOP, D, 0, H - TOP / 2, 0)
const drawers = merge(
  [-1, 1].map((side) =>
    b(W / 2 - 0.03, 0.19, 0.02, (side * W) / 4, 0.3, FRONT_Z),
  ),
)
const shadow = b(W, 0.004, D, 0, 0.002, 0)

export function build() {
  void legs4
  return {
    groups: [
      { name: 'tvstand-frame', material: 0, geometry: merge([plinth, sides, bottom, back, divider, shelf]) },
      { name: 'tvstand-shadow', material: 1, geometry: shadow },
      { name: 'tvstand-surface', material: 2, geometry: merge([topSlab, drawers]) },
    ],
  }
}
