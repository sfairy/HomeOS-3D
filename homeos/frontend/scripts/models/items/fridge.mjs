/**
 * `fridge`（750 × 1850 × 720 mm 双门冰箱）参数化重建。
 *
 * 槽位：0 箱体 / 1 门板 / 2 拉手。原模型是「一个大盒子 + 一条分缝贴图」，
 * 门板厚度、把手外凸与底部散热踢脚都不存在。
 */
import { cylinder, merge, transform } from '../lib/primitive-kit.mjs'
import { b } from '../lib/parts.mjs'

export const spec = { size: [0.75, 1.85, 0.72], mount: 'floor', topologyClass: 'solid' }

const W = 0.75
const H = 1.85
const SHELL_D = 0.7
const PANEL = 0.02
const PLINTH = 0.05
const DOOR_T = 0.02
const FRONT = SHELL_D / 2

const plinth = b(W - 0.06, PLINTH, SHELL_D - 0.08, 0, PLINTH / 2, -0.02)
const sides = merge(
  [-1, 1].map((side) => b(PANEL, H - PLINTH - PANEL, SHELL_D, (side * (W - PANEL)) / 2, (H + PLINTH) / 2, 0)),
)
const top = b(W, PANEL, SHELL_D, 0, H - PANEL / 2, 0)
const bottom = b(W - PANEL * 2, PANEL, SHELL_D - 0.02, 0, PLINTH + PANEL / 2, 0)
const back = b(W - PANEL * 2, H - PLINTH - PANEL * 2, 0.01, 0, (H + PLINTH) / 2, -SHELL_D / 2 + 0.005)
const divider = b(W - PANEL * 2, PANEL, SHELL_D - 0.02, 0, 0.72, 0)

const doors = merge([
  b(W, 1.06, DOOR_T, 0, 1.24, FRONT + DOOR_T / 2),
  b(W, 0.52, DOOR_T, 0, 0.34, FRONT + DOOR_T / 2),
])
const handles = merge([
  transform(cylinder({ radiusTop: 0.011, height: 0.42, segments: 10 }), {
    translate: [-W / 2 + 0.06, 1.36, FRONT + DOOR_T - 0.01],
  }),
  transform(cylinder({ radiusTop: 0.011, height: 0.3, segments: 10 }), {
    rotateZ: Math.PI / 2,
    translate: [0, 0.6, FRONT + DOOR_T - 0.01],
  }),
])

export function build() {
  return {
    groups: [
      { name: 'fridge-body', material: 0, geometry: merge([plinth, sides, top, bottom, back, divider]) },
      { name: 'fridge-panel', material: 1, geometry: doors },
      { name: 'fridge-handle', material: 2, geometry: handles },
    ],
  }
}
