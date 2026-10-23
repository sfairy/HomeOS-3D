/**
 * `toilet`（420 × 520 × 700 mm 连体马桶）参数化重建。
 *
 * 槽位：0 陶瓷（底座 + 水箱）/ 1 座圈与盖板 / 2 金属（按钮、铰链、角阀）。
 * 原模型是一个「陶瓷色方块」，座圈、水箱与出水口都没有分件。
 */
import { cylinder, merge, transform } from '../lib/primitive-kit.mjs'
import { b } from '../lib/parts.mjs'

export const spec = { size: [0.42, 0.52, 0.7], mount: 'floor', topologyClass: 'solid' }

const W = 0.42
const H = 0.52
const D = 0.7
const BOWL_TOP = 0.38
const TANK_FRONT = -0.12

const base = b(W - 0.08, 0.1, 0.34, 0, 0.05, 0.06)
const pedestal = b(W - 0.14, BOWL_TOP - 0.1, 0.3, 0, (BOWL_TOP + 0.1) / 2, 0.04)
const bowlBody = merge([
  b(W, BOWL_TOP - 0.22, D - 0.04, 0, (BOWL_TOP + 0.22) / 2, 0.02),
  b(W - 0.03, 0.06, D - 0.08, 0, BOWL_TOP - 0.03, 0.02),
])
const tank = merge([
  b(W - 0.02, H - BOWL_TOP, 0.22, 0, (H + BOWL_TOP) / 2, TANK_FRONT - 0.11),
  b(W - 0.04, 0.03, 0.2, 0, H - 0.015, TANK_FRONT - 0.11),
])

const seat = merge([
  b(W - 0.02, 0.03, D - 0.04, 0, BOWL_TOP + 0.015, 0.02),
  b(W - 0.04, 0.025, 0.16, 0, BOWL_TOP + 0.045, TANK_FRONT - 0.02),
])
const metal = merge([
  transform(cylinder({ radiusTop: 0.022, height: 0.008, segments: 16 }), {
    translate: [0, H - 0.004, TANK_FRONT - 0.11],
  }),
  transform(cylinder({ radiusTop: 0.008, height: 0.02, segments: 10 }), {
    rotateZ: Math.PI / 2,
    translate: [0, 0.16, -D / 2 + 0.03],
  }),
])

export function build() {
  return {
    groups: [
      { name: 'toilet-ceramic', material: 0, geometry: merge([base, pedestal, bowlBody, tank]) },
      { name: 'toilet-seat', material: 1, geometry: seat },
      { name: 'toilet-metal', material: 2, geometry: metal },
    ],
  }
}
