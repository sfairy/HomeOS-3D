/**
 * `sofa-single`（单人位布艺沙发）参数化重建。
 *
 * 规格 1050 × 820 × 900 mm；与 `sofa` 同一套构件规则，只是去掉中缝坐垫。
 */
import { merge, transform } from '../lib/primitive-kit.mjs'
import { b, legs4 } from '../lib/parts.mjs'

export const spec = { size: [1.05, 0.82, 0.9], mount: 'floor', topologyClass: 'solid' }

const W = 1.05
const H = 0.82
const D = 0.9
const LEG_H = 0.1
const BASE_TOP = 0.34
const SEAT_TOP = 0.48
const ARM_W = 0.14
const ARM_TOP = 0.62
const INNER_W = W - ARM_W * 2
const BACK_Z = -D / 2 + 0.1

const legs = legs4({
  width: W,
  depth: D,
  height: LEG_H,
  insetX: W / 2 - 0.08,
  insetZ: D / 2 - 0.09,
  size: 0.055,
})

const base = b(INNER_W, BASE_TOP - LEG_H, D - 0.16, 0, (BASE_TOP + LEG_H) / 2, 0.02)
const seat = b(INNER_W - 0.02, SEAT_TOP - BASE_TOP, D - 0.3, 0, (SEAT_TOP + BASE_TOP) / 2, 0.03)
const arms = merge(
  [-1, 1].map((side) =>
    b(ARM_W, ARM_TOP - LEG_H, D - 0.02, (side * (W - ARM_W)) / 2, (ARM_TOP + LEG_H) / 2, -0.01),
  ),
)
const back = b(W - 0.02, H - BASE_TOP, 0.2, 0, (H + BASE_TOP) / 2, BACK_Z)
const backCushion = transform(b(INNER_W - 0.04, 0.3, 0.14), {
  rotateX: 0.12,
  translate: [0, 0.66, BACK_Z + 0.17],
})
const pillow = transform(b(0.36, 0.32, 0.12), {
  rotateY: 0.28,
  translate: [-0.12, 0.55, BACK_Z + 0.27],
})
const shadow = b(W, 0.004, D, 0, 0.002, 0)

export function build() {
  return {
    groups: [
      { name: 'sofa-single-fabric', material: 0, geometry: merge([base, seat, arms, back, backCushion]) },
      { name: 'sofa-single-shadow', material: 1, geometry: shadow },
      { name: 'sofa-single-legs', material: 2, geometry: legs },
      { name: 'sofa-single-pillow', material: 3, geometry: pillow },
    ],
  }
}
