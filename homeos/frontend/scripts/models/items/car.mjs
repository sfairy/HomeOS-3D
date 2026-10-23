/**
 * `car`（2190 × 1430 × 5010 mm 中型 SUV）参数化重建。
 *
 * 槽位：0 车身（车漆，单槽位模型：所有构件共用一套材质）。
 * 原模型是「一整块车形灰模」，没有轮拱、轮胎、车窗与后视镜；车身与玻璃靠运行时着色
 * 分支区分，这里保持单槽位不变，只把比例与体量做对。
 */
import { cylinder, merge, transform } from '../lib/primitive-kit.mjs'
import { b } from '../lib/parts.mjs'

export const spec = { size: [2.19, 1.43, 5.01], mount: 'floor', topologyClass: 'solid' }

const W = 2.19
const H = 1.43
const D = 5.01
const WHEEL_R = 0.37
const WHEEL_W = 0.26
const BODY_W = 2.02
const AXLE_Z = [1.55, -1.5]

const wheels = merge(
  AXLE_Z.flatMap((z) =>
    [-1, 1].map((side) =>
      transform(cylinder({ radiusTop: WHEEL_R, height: WHEEL_W, segments: 28 }), {
        rotateZ: Math.PI / 2,
        translate: [side * (W / 2 - WHEEL_W / 2), WHEEL_R, z],
      }),
    ),
  ),
)
const lowerBody = b(BODY_W, 0.46, D - 0.16, 0, WHEEL_R + 0.15, 0)
const hood = b(BODY_W - 0.06, 0.16, 1.42, 0, WHEEL_R + 0.46, D / 2 - 0.79)
const trunk = b(BODY_W - 0.06, 0.16, 0.9, 0, WHEEL_R + 0.46, -D / 2 + 0.53)
/** 座舱：车顶到 1430，前后风挡用斜切的盒子近似。 */
const cabin = merge([
  b(BODY_W - 0.22, 0.42, 2.5, 0, WHEEL_R + 0.74, -0.12),
  transform(b(BODY_W - 0.3, 0.36, 0.5), { rotateX: 0.5, translate: [0, WHEEL_R + 0.62, 0.98] }),
  transform(b(BODY_W - 0.3, 0.38, 0.46), { rotateX: -0.45, translate: [0, WHEEL_R + 0.63, -1.24] }),
  b(BODY_W - 0.5, 0.06, 2.1, 0, H - 0.03, -0.12),
])
const roofRail = merge(
  [-1, 1].map((side) => b(0.05, 0.05, 2.0, side * (BODY_W / 2 - 0.24), H - 0.025, -0.12)),
)
const mirrors = merge(
  [-1, 1].map((side) => b(0.09, 0.1, 0.22, side * (W / 2 - 0.045), WHEEL_R + 0.72, 0.85)),
)
const bumpers = merge([
  b(BODY_W - 0.04, 0.26, 0.2, 0, WHEEL_R - 0.06, D / 2 - 0.1),
  b(BODY_W - 0.04, 0.26, 0.2, 0, WHEEL_R - 0.06, -D / 2 + 0.1),
])

export function build() {
  return {
    groups: [
      {
        name: 'car-body',
        material: 0,
        geometry: merge([wheels, lowerBody, hood, trunk, cabin, roofRail, mirrors, bumpers]),
      },
    ],
  }
}
