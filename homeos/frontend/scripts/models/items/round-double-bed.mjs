/**
 * `round-double-bed`（2070 × 871 × 2161 mm 圆床）参数化重建。
 *
 * 槽位：0 平台框 / 1 底座 / 2 床垫 / 3 软包（床头 + 靠枕）/ 4 支脚。
 * 原模型是「圆柱 + 薄片床头」，坐高、圆角与软包层次都不对。
 */
import { cylinder, merge, transform } from '../lib/primitive-kit.mjs'
import { b } from '../lib/parts.mjs'

export const spec = { size: [2.07, 0.871, 2.161], mount: 'floor', topologyClass: 'solid' }

const R = 1.035
const H = 0.871
const LEG_H = 0.09
const BASE_TOP = 0.23
const FRAME_TOP = 0.33
const MATTRESS_TOP = 0.571
const HEAD_BACK = -1.126
const HEAD_DEPTH = 0.14

const legs = merge(
  [0, 1, 2, 3].map((index) => {
    const angle = Math.PI / 4 + (index / 4) * Math.PI * 2
    return transform(cylinder({ radiusTop: 0.032, height: LEG_H, segments: 12 }), {
      translate: [Math.cos(angle) * (R - 0.14), LEG_H / 2, Math.sin(angle) * (R - 0.14)],
    })
  }),
)
const base = cylinder({ radiusTop: R, height: BASE_TOP - LEG_H, center: [0, (BASE_TOP + LEG_H) / 2, 0], segments: 48 })
const frame = cylinder({ radiusTop: R - 0.015, height: FRAME_TOP - BASE_TOP, center: [0, (FRAME_TOP + BASE_TOP) / 2, 0], segments: 48 })
const mattress = cylinder({
  radiusTop: R - 0.065,
  height: MATTRESS_TOP - FRAME_TOP,
  center: [0, (MATTRESS_TOP + FRAME_TOP) / 2, 0],
  segments: 48,
})

const headboard = b(1.44, H - MATTRESS_TOP, HEAD_DEPTH, 0, (H + MATTRESS_TOP) / 2, HEAD_BACK + HEAD_DEPTH / 2)
/** 床头与圆床之间的过渡靠枕：把 8cm 空隙填成软包，而不是留一条缝。 */
const bolster = merge(
  [-1, 0, 1].map((side) =>
    transform(cylinder({ radiusTop: 0.09, height: 0.42, segments: 16 }), {
      rotateZ: Math.PI / 2,
      translate: [side * 0.44, MATTRESS_TOP + 0.09, HEAD_BACK + HEAD_DEPTH + 0.09],
    }),
  ),
)

export function build() {
  return {
    groups: [
      { name: 'round-double-bed-frame', material: 0, geometry: frame },
      { name: 'round-double-bed-base', material: 1, geometry: base },
      { name: 'round-double-bed-mattress', material: 2, geometry: mattress },
      { name: 'round-double-bed-upholstery', material: 3, geometry: merge([headboard, bolster]) },
      { name: 'round-double-bed-legs', material: 4, geometry: legs },
    ],
  }
}
