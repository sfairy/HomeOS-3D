/**
 * `kitchen-island`（2143 × 1195 × 780 mm 带吧台与绿植的中岛）参数化重建。
 *
 * 槽位：0 门板 / 1 柜体 / 2 石材立板 / 3 台面 / 4 石纹嵌条 / 5 五金（拉手、踢脚）/ 6 绿植。
 * 原模型是一块「石头盒子」，台面厚度、门缝、踢脚和绿植都没有。
 */
import { cylinder, merge, transform } from '../lib/primitive-kit.mjs'
import { b, legs4, pullBar } from '../lib/parts.mjs'

export const spec = { size: [2.143, 1.195, 0.78], mount: 'floor', topologyClass: 'solid' }

const W = 2.143
const H = 1.195
const D = 0.78
const PLINTH = 0.04
const TOP_T = 0.05
const BODY_TOP = 0.9
const BODY_D = 0.7
const STONE_T = 0.05

const plinth = b(W - 0.1, PLINTH, BODY_D - 0.06, 0, PLINTH / 2, -0.02)
const carcass = merge([
  b(0.018, BODY_TOP - PLINTH, BODY_D, -(W - 0.1) / 2 + 0.009, (BODY_TOP + PLINTH) / 2, -0.02),
  b(0.018, BODY_TOP - PLINTH, BODY_D, (W - 0.1) / 2 - 0.009, (BODY_TOP + PLINTH) / 2, -0.02),
  b(W - 0.1, 0.018, BODY_D, 0, BODY_TOP - 0.009, -0.02),
  b(W - 0.1, 0.018, BODY_D, 0, PLINTH + 0.009, -0.02),
  b(W - 0.12, BODY_TOP - PLINTH, 0.01, 0, (BODY_TOP + PLINTH) / 2, -BODY_D / 2 - 0.015),
  b(W - 0.12, 0.018, BODY_D - 0.02, 0, 0.52, -0.02),
])
const fronts = merge(
  [-1, 1].map((side) =>
    b((W - 0.18) / 2 - 0.006, BODY_TOP - PLINTH - 0.06, 0.02, (side * (W - 0.16)) / 4, (BODY_TOP + PLINTH) / 2, BODY_D / 2 - 0.03),
  ),
)
const handles = merge(
  [-1, 1].map((side) =>
    pullBar({ length: 0.5, radius: 0.009, standoff: 0.022, center: [side * 0.5, 0.78, BODY_D / 2 + 0.005] }),
  ),
)

/** 台面：整体出挑到 780 深，两端做瀑布边（石材立板），形成「石盒子」的体量。 */
const counter = b(W, TOP_T, D, 0, BODY_TOP + TOP_T / 2, 0)
const stones = merge(
  [-1, 1].map((side) =>
    b(STONE_T, BODY_TOP + TOP_T, D, (side * (W - STONE_T)) / 2, (BODY_TOP + TOP_T) / 2, 0),
  ),
)
const veins = merge(
  [-1, 0, 1].map((index) =>
    b(0.9, 0.002, 0.012, index * 0.6, BODY_TOP + TOP_T + 0.001, -0.12 + index * 0.1),
  ),
)

/** 绿植：陶盆 + 6 片叶子，最高点正好等于规格高度 1195。 */
const potH = 0.14
const pot = cylinder({ radiusTop: 0.075, radiusBottom: 0.06, height: potH, segments: 20, center: [0.66, BODY_TOP + TOP_T + potH / 2, 0.12] })
const stems = merge(
  [0, 1, 2, 3, 4, 5].map((index) =>
    transform(cylinder({ radiusTop: 0.006, height: 0.14, segments: 6 }), {
      rotateZ: Math.cos(index) * 0.3,
      rotateX: Math.sin(index * 1.7) * 0.3,
      translate: [0.66, BODY_TOP + TOP_T + potH + 0.03, 0.12],
    }),
  ),
)
const leaves = merge(
  [0, 1, 2, 3, 4, 5].map((index) => {
    const angle = (index / 6) * Math.PI * 2
    const top = H - (index % 2) * 0.03
    return transform(b(0.06, 0.16, 0.012), {
      rotateY: angle,
      translate: [0.66 + Math.cos(angle) * 0.07, top - 0.08, 0.12 + Math.sin(angle) * 0.07],
    })
  }),
)

export function build() {
  void legs4
  return {
    groups: [
      { name: 'kitchen-island-front', material: 0, geometry: fronts },
      { name: 'kitchen-island-case', material: 1, geometry: merge([plinth, carcass]) },
      { name: 'kitchen-island-stone', material: 2, geometry: stones },
      { name: 'kitchen-island-top', material: 3, geometry: counter },
      { name: 'kitchen-island-vein', material: 4, geometry: veins },
      { name: 'kitchen-island-detail', material: 5, geometry: handles },
      { name: 'kitchen-island-foliage', material: 6, geometry: merge([pot, stems, leaves]) },
    ],
  }
}
