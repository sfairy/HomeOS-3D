/**
 * `steel-stairs`（1860 × 3450 × 2930 mm 钢结构楼梯）参数化重建。
 *
 * 槽位：0 钢踏板 / 1 框架（斜梁、立柱、扶手）。
 * 原模型只有 2 个材质却几乎没有可辨认的踏步，规格高度 3.45m 基本靠包围盒撑着。
 */
import { merge, transform } from '../lib/primitive-kit.mjs'
import { b } from '../lib/parts.mjs'

export const spec = { size: [1.86, 3.45, 2.93], mount: 'floor', topologyClass: 'solid' }

const W = 1.86
const H = 3.45
const D = 2.93
const STEPS = 14
const RISE = 0.23
const RUN = 0.19
const LANDING = D - STEPS * RUN
const TOP = STEPS * RISE

const treads = merge([
  ...Array.from({ length: STEPS }, (_, index) =>
    b(W, 0.03, RUN + 0.02, 0, (index + 1) * RISE, -D / 2 + index * RUN + RUN / 2),
  ),
  b(W, 0.03, LANDING, 0, TOP, D / 2 - LANDING / 2),
])

const stringerLength = Math.hypot(STEPS * RUN, TOP)
const stringer = transform(b(0.06, 0.1, stringerLength), {
  rotateX: -Math.atan2(TOP, STEPS * RUN),
  translate: [0, TOP / 2 + 0.05, -D / 2 + (STEPS * RUN) / 2],
})
const stringers = merge([
  transform(stringer, { translate: [W / 2 - 0.05, 0, 0] }),
  transform(stringer, { translate: [-W / 2 + 0.05, 0, 0] }),
])
const landingBeam = merge(
  [-1, 1].map((side) => b(0.06, 0.22, LANDING, side * (W / 2 - 0.05), TOP - 0.11, D / 2 - LANDING / 2)),
)

const railH = H - TOP
const posts = merge([
  transform(b(0.05, TOP + railH, 0.05), { translate: [W / 2 - 0.04, (TOP + railH) / 2, -D / 2 + 0.06] }),
  transform(b(0.05, TOP + railH, 0.05), { translate: [W / 2 - 0.04, (TOP + railH) / 2, D / 2 - LANDING / 2] }),
  transform(b(0.05, TOP + railH, 0.05), { translate: [-W / 2 + 0.04, (TOP + railH) / 2, -D / 2 + 0.06] }),
])
const slopedRail = transform(b(0.05, 0.05, stringerLength), {
  rotateX: -Math.atan2(TOP, STEPS * RUN),
  translate: [W / 2 - 0.04, TOP / 2 + railH, -D / 2 + (STEPS * RUN) / 2],
})
const landingRail = b(0.05, 0.05, LANDING, W / 2 - 0.04, H - 0.025, D / 2 - LANDING / 2)
const balusters = merge(
  Array.from({ length: STEPS }, (_, index) =>
    b(0.025, railH, 0.025, W / 2 - 0.04, (index + 1) * RISE + railH / 2, -D / 2 + index * RUN + RUN / 2),
  ),
)

export function build() {
  return {
    groups: [
      { name: 'steel-stairs-tread', material: 0, geometry: treads },
      {
        name: 'steel-stairs-frame',
        material: 1,
        geometry: merge([stringers, landingBeam, posts, slopedRail, landingRail, balusters]),
      },
    ],
  }
}
