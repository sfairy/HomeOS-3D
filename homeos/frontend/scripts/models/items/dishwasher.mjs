/**
 * `dishwasher`（600 × 820 × 600 mm 嵌入式洗碗机）参数化重建。
 *
 * 槽位：0 门板 / 1 箱体 / 2 控制面板 / 3 拉手。
 * 原模型门板与箱体共面、没有踢脚与把手，正视图只剩一块深色贴片。
 */
import { merge } from '../lib/primitive-kit.mjs'
import { b, pullBar } from '../lib/parts.mjs'

export const spec = { size: [0.6, 0.82, 0.6], mount: 'floor', topologyClass: 'solid' }

const W = 0.6
const H = 0.82
const BODY_D = 0.56
const FRONT = BODY_D / 2
const PANEL = 0.018

const shell = merge([
  b(PANEL, H, BODY_D, -(W - PANEL) / 2, H / 2, -0.01),
  b(PANEL, H, BODY_D, (W - PANEL) / 2, H / 2, -0.01),
  b(W, PANEL, BODY_D, 0, H - PANEL / 2, -0.01),
  b(W - PANEL * 2, PANEL, BODY_D - 0.02, 0, PANEL / 2, -0.01),
  b(W - PANEL * 2, H - PANEL, 0.01, 0, H / 2, -BODY_D / 2 - 0.005),
  b(W - 0.04, 0.09, 0.06, 0, 0.045, FRONT - 0.06),
])
const door = b(W - 0.004, H - 0.12, 0.02, 0, (H - 0.1) / 2 + 0.02, FRONT + 0.01)
const control = b(W - 0.004, 0.1, 0.02, 0, H - 0.05, FRONT + 0.012)
const handle = pullBar({ length: W - 0.16, radius: 0.01, standoff: 0.022, center: [0, H - 0.14, FRONT + 0.03] })

export function build() {
  return {
    groups: [
      { name: 'dishwasher-door', material: 0, geometry: door },
      { name: 'dishwasher-shell', material: 1, geometry: shell },
      { name: 'dishwasher-panel', material: 2, geometry: control },
      { name: 'dishwasher-handle', material: 3, geometry: handle },
    ],
  }
}
