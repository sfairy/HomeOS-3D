/**
 * `microwave`（520 × 320 × 420 mm 台面微波炉）参数化重建。
 *
 * 槽位：0 箱体 / 1 门体（含观察窗）/ 2 控制面板 / 3 拉手。
 */
import { merge, transform } from '../lib/primitive-kit.mjs'
import { b } from '../lib/parts.mjs'

export const spec = { size: [0.52, 0.32, 0.42], mount: 'tabletop', topologyClass: 'solid' }

const W = 0.52
const H = 0.32
const BODY_D = 0.38
const FRONT = BODY_D / 2
const PANEL = 0.014

const shell = merge([
  b(PANEL, H, BODY_D, -(W - PANEL) / 2, H / 2, -0.015),
  b(PANEL, H, BODY_D, (W - PANEL) / 2, H / 2, -0.015),
  b(W, PANEL, BODY_D, 0, H - PANEL / 2, -0.015),
  b(W, PANEL, BODY_D, 0, PANEL / 2, -0.015),
  b(W - PANEL * 2, H - PANEL * 2, 0.008, 0, H / 2, -BODY_D / 2 - 0.011),
])
/** 门板：左侧 3/4 宽，右侧留出控制列。控制列宽度写在 door 与 panel 的同一常量里。 */
const CONTROL_W = 0.13
const doorWidth = W - CONTROL_W - 0.004
const door = b(doorWidth, H - 0.03, 0.02, -W / 2 + doorWidth / 2 + 0.002, H / 2, FRONT + 0.01)
const doorGlass = b(doorWidth - 0.06, H - 0.1, 0.004, -W / 2 + doorWidth / 2 + 0.002, H / 2, FRONT + 0.022)
const control = b(CONTROL_W - 0.004, H - 0.03, 0.02, W / 2 - CONTROL_W / 2, H / 2, FRONT + 0.01)
const handle = transform(b(0.016, H - 0.09, 0.018), { translate: [W / 2 - CONTROL_W - 0.004, H / 2, FRONT + 0.005] })

export function build() {
  return {
    groups: [
      { name: 'microwave-body', material: 0, geometry: shell },
      { name: 'microwave-door', material: 1, geometry: merge([door, doorGlass]) },
      { name: 'microwave-panel', material: 2, geometry: control },
      { name: 'microwave-handle', material: 3, geometry: handle },
    ],
  }
}
