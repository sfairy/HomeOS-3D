/**
 * `coffeetable`（1900 × 500 × 1050 mm 双层茶几）参数化重建。
 *
 * 槽位：0 台面 / 1 框架（腿与望板）。原模型只有两块扁盒，没有厚度、倒角与层板。
 */
import { merge } from '../lib/primitive-kit.mjs'
import { b, legs4 } from '../lib/parts.mjs'

export const spec = { size: [1.9, 0.5, 1.05], mount: 'floor', topologyClass: 'solid' }

const W = 1.9
const H = 0.5
const D = 1.05
const TOP = 0.045
const SHELF = 0.03
const LEG = 0.05

const top = b(W, TOP, D, 0, H - TOP / 2, 0)
const shelf = b(W - 0.24, SHELF, D - 0.2, 0, 0.15, 0)
const legs = legs4({
  width: W,
  depth: D,
  height: H - TOP,
  insetX: W / 2 - 0.07,
  insetZ: D / 2 - 0.07,
  size: LEG,
})
/** 望板：台面下 8cm 的一圈收边，让侧面不再是三根孤立的腿。 */
const apron = merge([
  b(W - 0.18, 0.08, 0.025, 0, H - TOP - 0.04, D / 2 - 0.09),
  b(W - 0.18, 0.08, 0.025, 0, H - TOP - 0.04, -D / 2 + 0.09),
  b(0.025, 0.08, D - 0.18, W / 2 - 0.09, H - TOP - 0.04, 0),
  b(0.025, 0.08, D - 0.18, -W / 2 + 0.09, H - TOP - 0.04, 0),
])

export function build() {
  return {
    groups: [
      { name: 'coffeetable-top', material: 0, geometry: merge([top, shelf]) },
      { name: 'coffeetable-frame', material: 1, geometry: merge([legs, apron]) },
    ],
  }
}
