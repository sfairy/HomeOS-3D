/**
 * `sofa`（三人位布艺沙发）参数化重建。
 *
 * 规格 2200 × 820 × 900 mm。原模型是「一个大盒子 + 贴图」，没有坐垫分缝、扶手、
 * 靠背倾角与抱枕。槽位：0 布艺 / 1 接触阴影 / 2 木腿 / 3 抱枕。
 */
import { merge, transform } from '../lib/primitive-kit.mjs'
import { b, legs4 } from '../lib/parts.mjs'

export const spec = { size: [2.2, 0.82, 0.9], mount: 'floor', topologyClass: 'solid' }

const W = 2.2
const H = 0.82
const D = 0.9
const LEG_H = 0.1
const BASE_TOP = 0.34
const SEAT_TOP = 0.48
const ARM_W = 0.16
const ARM_TOP = 0.62
const INNER_W = W - ARM_W * 2
const BACK_Z = -D / 2 + 0.1

const legs = legs4({
  width: W,
  depth: D,
  height: LEG_H,
  insetX: W / 2 - 0.09,
  insetZ: D / 2 - 0.09,
  size: 0.06,
})

const base = b(INNER_W, BASE_TOP - LEG_H, D - 0.16, 0, (BASE_TOP + LEG_H) / 2, 0.02)

/** 坐垫：两半分缝，前缘压 2mm 避免与底框共面。 */
const seats = merge(
  [-1, 1].map((side) =>
    b(
      INNER_W / 2 - 0.012,
      SEAT_TOP - BASE_TOP,
      D - 0.3,
      (side * INNER_W) / 4,
      (SEAT_TOP + BASE_TOP) / 2,
      0.03,
    ),
  ),
)

const arms = merge(
  [-1, 1].map((side) =>
    b(ARM_W, ARM_TOP - LEG_H, D - 0.02, (side * (W - ARM_W)) / 2, (ARM_TOP + LEG_H) / 2, -0.01),
  ),
)

const back = b(W - 0.02, H - BASE_TOP, 0.2, 0, (H + BASE_TOP) / 2, BACK_Z)

/** 靠背垫：略向坐面倾，顶面低于靠背 4cm，形成层次。 */
const backCushions = merge(
  [-1, 1].map((side) =>
    transform(b(INNER_W / 2 - 0.02, 0.3, 0.14), {
      rotateX: 0.12,
      translate: [(side * INNER_W) / 4, 0.66, BACK_Z + 0.17],
    }),
  ),
)

const pillows = merge(
  [-1, 1].map((side) =>
    transform(b(0.4, 0.36, 0.12), {
      rotateY: side * 0.32,
      translate: [side * 0.54, 0.56, BACK_Z + 0.28],
    }),
  ),
)

const shadow = b(W, 0.004, D, 0, 0.002, 0)

export function build() {
  return {
    groups: [
      { name: 'sofa-fabric', material: 0, geometry: merge([base, seats, arms, back, backCushions]) },
      { name: 'sofa-shadow', material: 1, geometry: shadow },
      { name: 'sofa-legs', material: 2, geometry: legs },
      { name: 'sofa-pillows', material: 3, geometry: pillows },
    ],
  }
}
