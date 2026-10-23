/**
 * `bed`（1920 × 1020 × 2180 mm 双人床）参数化重建。
 *
 * 槽位：0 床架 / 1 床品布料 / 2 接触阴影 / 3 木构件（腿、排骨架）/ 4 枕头。
 * 原模型床垫直接贴在地板上，没有床架高度、床品下垂与床头板厚度。
 */
import { merge, transform } from '../lib/primitive-kit.mjs'
import { b, legs4 } from '../lib/parts.mjs'

export const spec = { size: [1.92, 1.02, 2.18], mount: 'floor', topologyClass: 'solid' }

const W = 1.92
const H = 1.02
const D = 2.18
const RAIL_TOP = 0.42
const LEG_H = 0.16
const MATTRESS_TOP = 0.64
const HEAD_Z = -D / 2 + 0.04

const headboard = b(W, H - 0.36, 0.08, 0, (H + 0.36) / 2, HEAD_Z)
const rails = merge([
  b(W, 0.2, 0.06, 0, RAIL_TOP - 0.1, D / 2 - 0.03),
  b(0.06, 0.2, D - 0.12, W / 2 - 0.03, RAIL_TOP - 0.1, 0),
  b(0.06, 0.2, D - 0.12, -W / 2 + 0.03, RAIL_TOP - 0.1, 0),
])
const legs = legs4({
  width: W,
  depth: D,
  height: LEG_H,
  insetX: W / 2 - 0.07,
  insetZ: D / 2 - 0.07,
  size: 0.07,
})
const slats = merge(
  Array.from({ length: 9 }, (_, index) =>
    b(W - 0.12, 0.02, 0.06, 0, RAIL_TOP - 0.02, -0.75 + index * 0.19),
  ),
)

const mattress = b(W - 0.1, 0.22, D - 0.16, 0, (MATTRESS_TOP + RAIL_TOP) / 2, 0.02)
const duvet = b(W - 0.04, 0.07, D - 0.62, 0, MATTRESS_TOP + 0.035, 0.16)
const pillows = merge(
  [-1, 1].map((side) =>
    transform(b(0.62, 0.14, 0.4), {
      rotateX: -0.08,
      translate: [side * 0.44, MATTRESS_TOP + 0.1, -0.62],
    }),
  ),
)
const shadow = b(W, 0.004, D, 0, 0.002, 0)

export function build() {
  return {
    groups: [
      { name: 'bed-frame', material: 0, geometry: merge([headboard, rails]) },
      { name: 'bed-textile', material: 1, geometry: merge([mattress, duvet]) },
      { name: 'bed-shadow', material: 2, geometry: shadow },
      { name: 'bed-wood', material: 3, geometry: merge([legs, slats]) },
      { name: 'bed-pillows', material: 4, geometry: pillows },
    ],
  }
}
