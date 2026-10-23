/**
 * `cabinet`（双门储物柜）参数化重建。
 *
 * 规格：1600 × 1900 × 450 mm。原模型只有 48 个三角面（四个盒子），
 * 门板、缝隙、拉手、踢脚线全都没有 —— 近看就是一个贴片。
 *
 * 槽位沿用 `cabinet-material-0..2`（`studio-external-models.ts` 里
 * `furnitureItemType === "cabinet"` 按 `material-2` 取门板深色）：
 * 0 柜体 / 1 踢脚与拉手 / 2 门板。
 */
import { box, merge, transform } from '../lib/primitive-kit.mjs'

export const spec = {
  size: [1.6, 1.9, 0.45],
  mount: 'floor',
  topologyClass: 'solid',
}

const WIDTH = 1.6
const HEIGHT = 1.9
const DEPTH = 0.45
const PANEL = 0.018
const PLINTH = 0.08
const TOP_SLAB = 0.022
const DOOR_THICKNESS = 0.018
const OVERLAP = 0.002
/** 门板 18mm + 拉手外凸 16mm 都算在 450 的总深里，柜体让出这 34mm。 */
const HANDLE_PROTRUSION = 0.016
const BODY_DEPTH = DEPTH - DOOR_THICKNESS - HANDLE_PROTRUSION
const BODY_Z = -(DOOR_THICKNESS + HANDLE_PROTRUSION) / 2
/** 门板外表面：拉手从这里再往外 16mm，正好与台面前缘齐平。 */
const DOOR_OUTER = DEPTH / 2 - HANDLE_PROTRUSION
const BODY_TOP = HEIGHT - TOP_SLAB

export function build() {
  // 踢脚：比柜体缩进 60mm，做出「悬空」的阴影线。
  const plinth = box({
    width: WIDTH - 0.08,
    height: PLINTH,
    depth: BODY_DEPTH - 0.06,
    center: [0, PLINTH / 2, BODY_Z - 0.03],
  })

  const side = box({
    width: PANEL,
    height: BODY_TOP - PLINTH + OVERLAP,
    depth: BODY_DEPTH,
    center: [0, 0, BODY_Z],
  })
  const sides = merge([
    transform(side, { translate: [WIDTH / 2 - PANEL / 2, (BODY_TOP + PLINTH) / 2, 0] }),
    transform(side, { translate: [-WIDTH / 2 + PANEL / 2, (BODY_TOP + PLINTH) / 2, 0] }),
  ])
  const back = box({
    width: WIDTH - PANEL * 2 + OVERLAP * 2,
    height: BODY_TOP - PLINTH + OVERLAP * 2,
    depth: 0.01,
    center: [0, (BODY_TOP + PLINTH) / 2, BODY_Z - BODY_DEPTH / 2 + 0.005],
  })
  const bottom = box({
    width: WIDTH - PANEL * 2 + OVERLAP * 2,
    height: PANEL,
    depth: BODY_DEPTH - 0.01 + OVERLAP,
    center: [0, PLINTH + PANEL / 2, BODY_Z + OVERLAP / 2],
  })
  const shelf = box({
    width: WIDTH - PANEL * 2 + OVERLAP * 2,
    height: PANEL,
    depth: BODY_DEPTH - 0.012,
    center: [0, PLINTH + (BODY_TOP - PLINTH) * 0.52, BODY_Z + 0.004],
  })
  // 台面：前后各出挑 10mm，正面盖住门板顶端。
  const top = box({
    width: WIDTH,
    height: TOP_SLAB,
    depth: DEPTH,
    center: [0, HEIGHT - TOP_SLAB / 2, 0],
  })

  // 两扇门：各留 2mm 缝，内侧各压进柜体 2mm 避免共面接缝。
  const doorWidth = (WIDTH - 0.008) / 2
  const doorHeight = BODY_TOP - PLINTH - 0.006
  const door = box({
    width: doorWidth,
    height: doorHeight,
    depth: DOOR_THICKNESS,
    center: [0, 0, 0],
  })
  const doors = merge([
    transform(door, {
      translate: [doorWidth / 2 + 0.003, PLINTH + 0.003 + doorHeight / 2, DOOR_OUTER - DOOR_THICKNESS / 2],
    }),
    transform(door, {
      translate: [-doorWidth / 2 - 0.003, PLINTH + 0.003 + doorHeight / 2, DOOR_OUTER - DOOR_THICKNESS / 2],
    }),
  ])
  // 竖向长拉手：靠门缝内侧，高 240、离门面 18mm。
  const handle = box({ width: 0.016, height: 0.24, depth: 0.016, center: [0, 0, 0] })
  const handles = merge([
    transform(handle, { translate: [0.045, 1.12, DOOR_OUTER + 0.008] }),
    transform(handle, { translate: [-0.045, 1.12, DOOR_OUTER + 0.008] }),
  ])

  return {
    groups: [
      { name: 'cabinet-carcass', material: 0, geometry: merge([sides, back, bottom, shelf, top]) },
      { name: 'cabinet-base', material: 1, geometry: merge([plinth, handles]) },
      { name: 'cabinet-door', material: 2, geometry: doors },
    ],
  }
}
