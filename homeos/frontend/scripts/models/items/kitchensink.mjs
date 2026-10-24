/**
 * `kitchensink`（1200 单槽台下盆水盆柜）形态重建。
 *
 * 原件实测（HEAD 的 `地柜带水盆.glb`，200 面 / 11 壳）：
 * - 柜体 = 12 面实心箱（1200 × 705 × 600），正面只有一块 1152 × 635 的整门板 + 一根
 *   768mm 通长拉手 —— 不是 600 柜的两扇门，也没有门缝 / 踢脚；
 * - 水盆 = 台面上方叠着两块薄板（504×312×25 与 408×240×20），也就是**台上盆**，
 *   没有盆胆、没有开孔，看不到任何下凹的盆；
 * - 龙头偏心在右后角（x 0.072..0.264、z −0.12..−0.084），只有一根 187mm 立管 +
 *   192mm 横管，不像厨房龙头。
 *
 * 重建口径：真实 1200 下柜 + 20mm 石英石台面 + 橱柜开孔，**盆沿藏在台面之下**
 * （台下盆），盆胆单槽 560 × 400、内深 235mm、盆壁带拔模斜度，龙头回到水槽正后方
 * 中线并做成鹅颈弯管。
 *
 * 槽位（顺序沿用原件，材质名不改）：
 * 0 踢脚 / 1 柜体 / 2 台面 / 3 盆胆 / 4 下水与溢水口 / 5 龙头 / 6 柜门 / 7 门拉手。
 */
import { box, cylinder, merge, transform } from '../lib/primitive-kit.mjs'
import {
  baseCabinet,
  gooseneckArc,
  rectBowlShell,
  BODY_DEPTH,
} from '../lib/kitchen-parts.mjs'

export const spec = { size: [1.224, 1.037, 0.648], mount: 'floor', topologyClass: 'solid' }

const WIDTH = 1.224
const DEPTH = 0.648
const COUNTER_TOP = 0.85
const COUNTER_T = 0.02
const COUNTER_BOTTOM = COUNTER_TOP - COUNTER_T

/** 台面开孔（水槽内沿）：560 × 400，居中。 */
const OPENING_W = 0.56
const OPENING_D = 0.4
const OPENING_FRONT = OPENING_D / 2
const OPENING_BACK = -OPENING_D / 2

/**
 * 盆胆（台下盆）：
 * - 盆沿整圈压在台面**底面之下** 0.3mm，外沿比开孔再宽 19mm —— 站在台面上只看到开孔
 *   与盆壁，看不到任何盆沿；
 * - 内沿比开孔大 1mm（562 × 402），台面削边把盆壁顶端盖住，不会露出「台上盆」的白边；
 * - 内深 235mm（0.8297 → 0.5947），比原先的 210mm 深一档，接近 600 单槽的标称深度；
 * - 盆壁向内收 19～25mm 的拔模斜度，从上往下看得出「往里去」。
 */
const RIM_Y = COUNTER_BOTTOM - 0.0003
const BOWL_INNER_DEPTH = 0.235
const INNER_FLOOR_Y = RIM_Y - BOWL_INNER_DEPTH
const BOWL_FLOOR_T = 0.005
const OUTER_FLOOR_Y = INNER_FLOOR_Y - BOWL_FLOOR_T
const RIM_OUTER = [0.6, 0.44]
const RIM_INNER = [OPENING_W + 0.002, OPENING_D + 0.002]
const BOTTOM_OUTER = [0.524, 0.364]
const BOTTOM_INNER = [0.516, 0.356]

/** 龙头：水槽正后方中线，鹅颈顶正好等于规格高度 1.037。 */
const FAUCET_Z = -0.245
const FAUCET_ARC_R = 0.035

function bowl() {
  return rectBowlShell({
    rimOuter: RIM_OUTER,
    rimInner: RIM_INNER,
    bottomOuter: BOTTOM_OUTER,
    bottomInner: BOTTOM_INNER,
    rimY: RIM_Y,
    innerFloorY: INNER_FLOOR_Y,
    outerFloorY: OUTER_FLOOR_Y,
  })
}

function drain() {
  // 下水口：盆底中心的法兰 + 内盖；溢水口在后壁内侧上部（深盆的溢水口相应下移）。
  const flange = cylinder({
    radiusTop: 0.036,
    height: 0.006,
    segments: 24,
    center: [0, INNER_FLOOR_Y + 0.003, 0],
  })
  const strainer = cylinder({
    radiusTop: 0.028,
    height: 0.003,
    segments: 24,
    center: [0, INNER_FLOOR_Y + 0.0075, 0],
  })
  const overflow = box({
    width: 0.062,
    height: 0.022,
    depth: 0.004,
    center: [0, 0.792, OPENING_BACK + 0.004],
  })
  return merge([flange, strainer, overflow])
}

function faucet() {
  // 底座 → 加粗筒身 → 细立管 → 鹅颈弯 → 出水嘴 → 起泡器，全部在 z = FAUCET_Z 中线。
  const basePlate = cylinder({
    radiusTop: 0.032,
    height: 0.006,
    segments: 24,
    center: [0, COUNTER_TOP + 0.003, FAUCET_Z],
  })
  const body = cylinder({
    radiusTop: 0.024,
    height: 0.05,
    segments: 20,
    center: [0, COUNTER_TOP + 0.031, FAUCET_Z],
  })
  const riserBottom = COUNTER_TOP + 0.05
  const riserTop = 0.985
  const riser = cylinder({
    radiusTop: 0.018,
    height: riserTop - riserBottom,
    segments: 20,
    center: [0, (riserBottom + riserTop) / 2, FAUCET_Z],
  })
  const arc = gooseneckArc({
    baseY: riserTop,
    baseZ: FAUCET_Z,
    radius: FAUCET_ARC_R,
    tubeRadius: 0.017,
  })
  const spoutZ = FAUCET_Z + FAUCET_ARC_R * 2
  const nozzle = cylinder({
    radiusTop: 0.019,
    height: 0.032,
    segments: 18,
    center: [0, riserTop - 0.016, spoutZ],
  })
  const aerator = cylinder({
    radiusTop: 0.015,
    height: 0.007,
    segments: 18,
    center: [0, riserTop - 0.0355, spoutZ],
  })
  // 右侧单柄：一段水平圆管 + 端头。
  const lever = transform(cylinder({ radiusTop: 0.008, height: 0.072, segments: 12 }), {
    rotateZ: Math.PI / 2,
    translate: [0.058, COUNTER_TOP + 0.045, FAUCET_Z],
  })
  const leverCap = cylinder({
    radiusTop: 0.011,
    height: 0.014,
    segments: 14,
    center: [0.092, COUNTER_TOP + 0.045, FAUCET_Z],
  })
  return merge([basePlate, body, riser, arc, nozzle, aerator, lever, leverCap])
}

export function build() {
  // 开顶 + 无层板：真实水槽柜的柜顶要开孔给盆胆穿过，下半给存水弯留空。
  const { plinth, carcass, doors, handles } = baseCabinet({
    width: 1.2,
    carcassTop: COUNTER_BOTTOM,
    bodyDepth: BODY_DEPTH,
    openTop: true,
    shelf: false,
  })

  const sideWidth = WIDTH / 2 - OPENING_W / 2
  const frontDepth = DEPTH / 2 - OPENING_FRONT
  const backDepth = OPENING_BACK + DEPTH / 2
  const counter = merge([
    box({ width: WIDTH, height: COUNTER_T, depth: frontDepth, center: [0, COUNTER_TOP - COUNTER_T / 2, OPENING_FRONT + frontDepth / 2] }),
    box({ width: WIDTH, height: COUNTER_T, depth: backDepth, center: [0, COUNTER_TOP - COUNTER_T / 2, OPENING_BACK - backDepth / 2] }),
    ...[-1, 1].map((side) =>
      box({
        width: sideWidth,
        height: COUNTER_T,
        // 侧边带前后各多压 1mm 进前后边带，避免拐角处共边（焊接后是非流形边）。
        depth: OPENING_D + 0.002,
        center: [side * (OPENING_W / 2 + sideWidth / 2), COUNTER_TOP - COUNTER_T / 2, 0],
      }),
    ),
  ])

  return {
    groups: [
      { name: 'kitchensink-base', material: 0, geometry: plinth },
      { name: 'kitchensink-body', material: 1, geometry: carcass },
      { name: 'kitchensink-top', material: 2, geometry: counter },
      { name: 'kitchensink-sink', material: 3, geometry: bowl() },
      { name: 'kitchensink-sink-2', material: 4, geometry: drain() },
      { name: 'kitchensink-metal', material: 5, geometry: faucet() },
      { name: 'kitchensink-door', material: 6, geometry: doors },
      { name: 'kitchensink-metal-2', material: 7, geometry: handles },
    ],
  }
}
