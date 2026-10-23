/**
 * `dryer`（600 × 850 × 650 mm 热泵干衣机）参数化重建。
 *
 * 槽位：0 外壳 / 1 门体 / 2 控制面板 / 3 饰条（旋钮、洗涤剂盒）/ 4 玻璃窗。
 * 原模型的「圆形舱门」是贴在平面上的贴图，舱门厚度与内凹玻璃都没有。
 */
import { cylinder, merge, transform } from '../lib/primitive-kit.mjs'
import { b } from '../lib/parts.mjs'

export const spec = { size: [0.6, 0.85, 0.65], mount: 'floor', topologyClass: 'solid' }

const W = 0.6
const H = 0.85
const SHELL_D = 0.62
const FRONT = SHELL_D / 2
const PLINTH = 0.04
const PANEL = 0.02

const shell = merge([
  b(W - 0.03, PLINTH, SHELL_D - 0.04, 0, PLINTH / 2, -0.015),
  b(PANEL, H - PLINTH, SHELL_D, -(W - PANEL) / 2, (H + PLINTH) / 2, 0),
  b(PANEL, H - PLINTH, SHELL_D, (W - PANEL) / 2, (H + PLINTH) / 2, 0),
  b(W, PANEL, SHELL_D, 0, H - PANEL / 2, 0),
  b(W - PANEL * 2, PANEL, SHELL_D - 0.02, 0, PLINTH + PANEL / 2, 0),
  b(W - PANEL * 2, H - PLINTH - PANEL, 0.01, 0, (H + PLINTH) / 2, -SHELL_D / 2 + 0.005),
])

/** 舱门：外圈金属环 + 内圈门板，正面比箱体多凸 30mm（正好用满 650 深度）。 */
const doorRing = transform(cylinder({ radiusTop: 0.205, height: 0.03, segments: 40 }), {
  rotateX: Math.PI / 2,
  translate: [0, 0.45, FRONT + 0.005],
})
const doorFace = transform(cylinder({ radiusTop: 0.175, height: 0.012, segments: 40 }), {
  rotateX: Math.PI / 2,
  translate: [0, 0.45, FRONT + 0.018],
})

const panel = b(W - 0.06, 0.1, 0.02, 0, 0.76, FRONT + 0.01)
const knob = transform(cylinder({ radiusTop: 0.028, height: 0.022, segments: 20 }), {
  rotateX: Math.PI / 2,
  translate: [W / 2 - 0.1, 0.76, FRONT + 0.021],
})
const drawer = b(0.16, 0.07, 0.014, -W / 2 + 0.11, 0.76, FRONT + 0.022)
const window = transform(cylinder({ radiusTop: 0.15, height: 0.01, segments: 40 }), {
  rotateX: Math.PI / 2,
  translate: [0, 0.45, FRONT + 0.026],
})

export function build() {
  return {
    groups: [
      { name: 'dryer-shell', material: 0, geometry: shell },
      { name: 'dryer-door', material: 1, geometry: merge([doorRing, doorFace]) },
      { name: 'dryer-panel', material: 2, geometry: panel },
      { name: 'dryer-trim', material: 3, geometry: merge([knob, drawer]) },
      { name: 'dryer-window', material: 4, geometry: window },
    ],
  }
}
