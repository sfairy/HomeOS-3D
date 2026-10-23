/**
 * `stairs`（1000 × 1650 × 2800 mm 直跑楼梯）参数化重建。
 *
 * 槽位：0 踏步体 / 1 踏面板 / 2 扶手与立柱。
 * 原模型是「斜着的一块板」，踏步、踢面、栏杆都没有，行人尺度完全读不出来。
 */
import { merge, transform } from '../lib/primitive-kit.mjs'
import { b } from '../lib/parts.mjs'

export const spec = { size: [1.0, 1.65, 2.8], mount: 'floor', topologyClass: 'solid' }

const W = 1.0
const H = 1.65
const D = 2.8
const STEPS = 8
const RISE = 0.175
const RUN = 0.3
const LANDING = D - STEPS * RUN
const TOP = STEPS * RISE

const body = merge(
  Array.from({ length: STEPS }, (_, index) =>
    b(W, (index + 1) * RISE, RUN, 0, ((index + 1) * RISE) / 2, -D / 2 + index * RUN + RUN / 2),
  ),
)
const landing = b(W, TOP, LANDING, 0, TOP / 2, D / 2 - LANDING / 2)
const treads = merge([
  ...Array.from({ length: STEPS }, (_, index) =>
    b(W, 0.02, RUN + 0.01, 0, (index + 1) * RISE + 0.01, -D / 2 + index * RUN + RUN / 2),
  ),
  b(W, 0.02, LANDING, 0, TOP + 0.01, D / 2 - LANDING / 2),
])

/** 扶手：落地立柱 + 斜向扶手 + 顶部水平段，最高点 1650。 */
const postH = H - TOP
const posts = merge([
  transform(b(0.05, TOP + postH, 0.05), { translate: [W / 2 - 0.04, (TOP + postH) / 2, -D / 2 + 0.06] }),
  transform(b(0.05, TOP + postH, 0.05), { translate: [W / 2 - 0.04, (TOP + postH) / 2, D / 2 - LANDING / 2] }),
])
const slopedRail = transform(b(0.05, 0.05, Math.hypot(STEPS * RUN, TOP)), {
  rotateX: -Math.atan2(TOP, STEPS * RUN),
  translate: [W / 2 - 0.04, TOP / 2 + postH, -D / 2 + (STEPS * RUN) / 2],
})
const landingRail = b(0.05, 0.05, LANDING, W / 2 - 0.04, H - 0.025, D / 2 - LANDING / 2)
const balusters = merge(
  Array.from({ length: STEPS }, (_, index) =>
    b(
      0.025,
      postH,
      0.025,
      W / 2 - 0.04,
      (index + 1) * RISE + postH / 2,
      -D / 2 + index * RUN + RUN / 2,
    ),
  ),
)

export function build() {
  return {
    groups: [
      { name: 'stairs-body', material: 0, geometry: merge([body, landing]) },
      { name: 'stairs-top', material: 1, geometry: treads },
      { name: 'stairs-trim', material: 2, geometry: merge([posts, slopedRail, landingRail, balusters]) },
    ],
  }
}
