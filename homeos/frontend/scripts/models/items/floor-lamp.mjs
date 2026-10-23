/**
 * `floor-lamp`（1600 × 2000 × 450 mm 弧形落地灯）参数化重建。
 *
 * 槽位：0 灯罩内发光面 / 1 金属（灯杆、弧臂、开关）/ 2 灯罩外壳 / 3 饰环 / 4 灯泡 / 5 底座。
 * 原模型槽位名是 SimLab 原始名（`frosted-white`、`*5`、`[color_008]1`），且宽度 2.04m
 * 明显偏大；按「底座 450、弧臂到 1600、总高 2000」重建。
 */
import { cylinder, merge, transform } from '../lib/primitive-kit.mjs'
import { b } from '../lib/parts.mjs'

export const spec = { size: [1.6, 2.0, 0.45], mount: 'floor', topologyClass: 'solid' }

const BASE_X = -0.58
const SHADE_X = 0.62
const BASE_R = 0.225
const STEM_TOP = 1.98

const base = merge([
  cylinder({ radiusTop: BASE_R, height: 0.03, segments: 36, center: [BASE_X, 0.015, 0] }),
  cylinder({ radiusTop: 0.05, height: 0.04, segments: 20, center: [BASE_X, 0.05, 0] }),
])
/** 灯杆 + 弧臂：竖杆到 1.9，再一段水平臂把灯罩挑出去，弧顶正好是 2000mm。 */
const stem = transform(cylinder({ radiusTop: 0.02, height: STEM_TOP - 0.05, segments: 16 }), {
  translate: [BASE_X, (STEM_TOP + 0.05) / 2, 0],
})
const arm = transform(cylinder({ radiusTop: 0.018, height: SHADE_X - BASE_X, segments: 16 }), {
  rotateZ: Math.PI / 2,
  translate: [(BASE_X + SHADE_X) / 2, STEM_TOP, 0],
})
const switchKnob = transform(cylinder({ radiusTop: 0.016, height: 0.03, segments: 12 }), {
  translate: [BASE_X, 1.15, 0.03],
})

const shade = cylinder({
  radiusTop: 0.18,
  radiusBottom: 0.1,
  height: 0.28,
  segments: 36,
  center: [SHADE_X, 1.76, 0],
})
const glow = transform(cylinder({ radiusTop: 0.165, height: 0.01, segments: 36 }), {
  translate: [SHADE_X, 1.625, 0],
})
const bulb = transform(cylinder({ radiusTop: 0.055, height: 0.09, segments: 16 }), {
  translate: [SHADE_X, 1.62, 0],
})
const trim = merge([
  transform(cylinder({ radiusTop: 0.185, height: 0.02, segments: 36 }), {
    translate: [SHADE_X, 1.9, 0],
  }),
  transform(cylinder({ radiusTop: 0.105, height: 0.015, segments: 24 }), {
    translate: [SHADE_X, 1.612, 0],
  }),
])

export function build() {
  void b
  return {
    groups: [
      { name: 'floor-lamp-lit', material: 0, geometry: glow },
      { name: 'floor-lamp-metal', material: 1, geometry: merge([stem, arm, switchKnob]) },
      { name: 'floor-lamp-body', material: 2, geometry: shade },
      { name: 'floor-lamp-trim', material: 3, geometry: trim },
      { name: 'floor-lamp-bulb', material: 4, geometry: bulb },
      { name: 'floor-lamp-base', material: 5, geometry: base },
    ],
  }
}
