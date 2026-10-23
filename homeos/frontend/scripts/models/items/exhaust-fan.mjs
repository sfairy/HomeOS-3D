/**
 * `exhaust-fan`（340 × 340 × 210 mm 壁挂换气扇）参数化重建。
 *
 * 槽位：0 扇叶 / 1 外框 / 2 壳体（后板）/ 3 风道内衬 / 4 紧固件。
 * 原模型是「一个方盒 + 圆形贴图」，叶片与风道都不存在。规格深度 0.21m。
 */
import { cylinder, merge, transform } from '../lib/primitive-kit.mjs'
import { b } from '../lib/parts.mjs'

export const spec = { size: [0.34, 0.34, 0.21], mount: 'wall', topologyClass: 'solid' }

const W = 0.34
const H = 0.34
const D = 0.21
const BACK = -D / 2
const FRONT = D / 2
const OPENING = 0.24
const FRAME = (W - OPENING) / 2

const backPlate = b(W, H, 0.02, 0, 0, BACK + 0.01)
const frameBars = merge([
  b(W, FRAME, D - 0.02, 0, H / 2 - FRAME / 2, 0),
  b(W, FRAME, D - 0.02, 0, -H / 2 + FRAME / 2, 0),
  b(FRAME, OPENING, D - 0.02, -W / 2 + FRAME / 2, 0, 0),
  b(FRAME, OPENING, D - 0.02, W / 2 - FRAME / 2, 0, 0),
])
const rim = merge([
  b(W, 0.012, 0.02, 0, H / 2 - 0.006, FRONT - 0.01),
  b(W, 0.012, 0.02, 0, -H / 2 + 0.006, FRONT - 0.01),
  b(0.012, OPENING, 0.02, -W / 2 + 0.006, 0, FRONT - 0.01),
  b(0.012, OPENING, 0.02, W / 2 - 0.006, 0, FRONT - 0.01),
])
const duct = transform(cylinder({ radiusTop: OPENING / 2 + 0.006, height: 0.012, segments: 32 }), {
  rotateX: Math.PI / 2,
  translate: [0, 0, BACK + 0.028],
})

const hub = transform(cylinder({ radiusTop: 0.032, height: 0.05, segments: 20 }), {
  rotateX: Math.PI / 2,
  translate: [0, 0, BACK + 0.07],
})
const blades = merge(
  [0, 1, 2, 3, 4].map((index) => {
    const angle = (index / 5) * Math.PI * 2
    return transform(b(0.1, 0.05, 0.006), {
      rotateZ: 0.5,
      rotateY: angle,
      translate: [Math.cos(angle) * 0.062, Math.sin(angle) * 0.062, BACK + 0.07],
    })
  }),
)
const fasteners = merge(
  [
    [-W / 2 + 0.022, H / 2 - 0.022],
    [W / 2 - 0.022, H / 2 - 0.022],
    [-W / 2 + 0.022, -H / 2 + 0.022],
    [W / 2 - 0.022, -H / 2 + 0.022],
  ].map(([x, y]) =>
    transform(cylinder({ radiusTop: 0.008, height: 0.012, segments: 10 }), {
      rotateX: Math.PI / 2,
      translate: [x, y, FRONT - 0.004],
    }),
  ),
)

export function build() {
  return {
    groups: [
      { name: 'exhaust-fan-blade', material: 0, geometry: merge([hub, blades]) },
      { name: 'exhaust-fan-edge', material: 1, geometry: rim },
      { name: 'exhaust-fan-shell', material: 2, geometry: merge([backPlate, frameBars]) },
      { name: 'exhaust-fan-bore', material: 3, geometry: duct },
      { name: 'exhaust-fan-fastener', material: 4, geometry: fasteners },
    ],
  }
}
