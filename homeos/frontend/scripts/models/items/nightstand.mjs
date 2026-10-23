/**
 * `nightstand`（床头柜）参数化重建。
 *
 * 规格：500 × 550 × 420 mm（宽 × 高 × 深），落地件、前朝 +Z。
 * 关键比例：腿高 150（细锥腿，离地通风）、柜体 380、台面 20、抽屉面 140 × 440。
 *
 * 槽位沿用源文件的 `nightstand-material-0..4`，因为 `studio-external-models.ts` 里
 * `furnitureItemType === "nightstand"` 按 `material-2` 下标取台面色，改名会静默失效。
 * 构件分配：0 腿框 / 1 柜体 / 2 台面 / 3 抽屉面 / 4 拉手。
 */
import { box, cylinder, merge, transform } from '../lib/primitive-kit.mjs'

export const spec = {
  size: [0.5, 0.55, 0.42],
  mount: 'floor',
  topologyClass: 'solid',
}

const WIDTH = 0.5
const HEIGHT = 0.55
const DEPTH = 0.42
const LEG = 0.15
const TOP_THICKNESS = 0.02
const PANEL = 0.018
/** 柜体比台面浅 20mm：台面前缘出挑，抽屉面 + 拉手在这个出挑里做文章。 */
const BODY_DEPTH = DEPTH - 0.02
const BODY_Z = -(DEPTH - BODY_DEPTH) / 2
/**
 * 构件之间**重叠 2mm** 而不是刚好贴合：贴合会留下「两个面共用一条边」的 T 形接缝，
 * 焊接后就成了非流形边（实测刚好贴合时整件 4 条）。重叠既不留缝，也不产生 3 面共边。
 */
const OVERLAP = 0.002
const BODY_BOTTOM = LEG
const BODY_TOP = HEIGHT - TOP_THICKNESS

export function build() {
  // 四条锥形腿：上粗下细，往里收 25mm，读起来是实木腿而不是四根棍。
  const leg = cylinder({
    radiusTop: 0.018,
    radiusBottom: 0.012,
    height: LEG,
    segments: 12,
    center: [0, LEG / 2, 0],
  })
  const legX = WIDTH / 2 - 0.045
  const legZ = DEPTH / 2 - 0.045
  const legs = merge(
    [1, -1].flatMap((sx) =>
      [1, -1].map((sz) => transform(leg, { translate: [sx * legX, 0, sz * legZ] })),
    ),
  )

  // 柜体：两侧板 + 背板 + 顶底，中间留一层开放式储物格。
  const side = box({ width: PANEL, height: BODY_TOP - BODY_BOTTOM, depth: BODY_DEPTH, center: [0, 0, 0] })
  const sides = merge([
    transform(side, { translate: [WIDTH / 2 - PANEL / 2, (BODY_TOP + BODY_BOTTOM) / 2, BODY_Z] }),
    transform(side, { translate: [-WIDTH / 2 + PANEL / 2, (BODY_TOP + BODY_BOTTOM) / 2, BODY_Z] }),
  ])
  const back = box({
    width: WIDTH - PANEL * 2 + OVERLAP * 2,
    height: BODY_TOP - BODY_BOTTOM + OVERLAP * 2,
    depth: PANEL,
    center: [0, (BODY_TOP + BODY_BOTTOM) / 2, BODY_Z - BODY_DEPTH / 2 + PANEL / 2],
  })
  const bottom = box({
    width: WIDTH - PANEL * 2 + OVERLAP * 2,
    height: PANEL,
    depth: BODY_DEPTH - PANEL + OVERLAP,
    center: [0, BODY_BOTTOM + PANEL / 2, BODY_Z + OVERLAP / 2],
  })
  // 抽屉箱：下方 200mm 高的抽屉，上方开放格里再放一块隔板。
  const drawerTop = BODY_BOTTOM + 0.2
  const shelf = box({
    width: WIDTH - PANEL * 2 + OVERLAP * 2,
    height: PANEL,
    depth: BODY_DEPTH - PANEL + OVERLAP,
    center: [0, drawerTop + PANEL / 2, BODY_Z + OVERLAP / 2],
  })
  const drawerFront = box({
    width: WIDTH - PANEL * 2 - 0.006,
    height: 0.2 - PANEL * 1.5,
    depth: 0.012,
    center: [0, BODY_BOTTOM + 0.2 / 2, BODY_Z + BODY_DEPTH / 2 + 0.006],
  })
  const drawerSide = box({
    width: WIDTH - PANEL * 2,
    height: 0.2 - PANEL + OVERLAP * 2,
    depth: 0.012,
    center: [0, 0, 0],
  })
  const drawerBox = merge([
    transform(drawerSide, { translate: [0, BODY_BOTTOM + PANEL + (0.2 - PANEL) / 2, BODY_Z + BODY_DEPTH / 2 - 0.03] }),
    transform(drawerSide, { translate: [0, BODY_BOTTOM + PANEL + (0.2 - PANEL) / 2, BODY_Z - BODY_DEPTH / 2 + PANEL + 0.012] }),
  ])
  // 拉手：22mm 宽的一段横向金属条，离抽屉面上沿 40mm。
  const handle = box({
    width: 0.13,
    height: 0.014,
    depth: 0.008,
    // 拉手外缘与台面前缘齐平（z = DEPTH/2），总深不会被拉手撑大。
    center: [0, BODY_BOTTOM + 0.2 - 0.05, DEPTH / 2 - 0.004],
  })

  const top = box({
    width: WIDTH,
    height: TOP_THICKNESS,
    depth: DEPTH,
    center: [0, HEIGHT - TOP_THICKNESS / 2, 0],
  })

  return {
    groups: [
      { name: 'nightstand-leg', material: 0, geometry: legs },
      { name: 'nightstand-carcass', material: 1, geometry: merge([sides, back, bottom, shelf, drawerBox]) },
      { name: 'nightstand-top', material: 2, geometry: top },
      { name: 'nightstand-drawer', material: 3, geometry: drawerFront },
      { name: 'nightstand-handle', material: 4, geometry: handle },
    ],
  }
}
