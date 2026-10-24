/**
 * `kitchencooktop`（600 双眼燃气灶下柜）形态重建。
 *
 * 原件实测（HEAD 的 `地柜带燃气灶.glb`，928 面 / 16 壳）：
 * - 柜体与水盆柜同一套「三块实心箱」：1200 × 705 × 600 的实心柜体 + 一块 1152 宽的整门板
 *   + 一根 768mm 通长拉手；
 * - 灶具 = 台面上方一块 576 × 330 × 25 的黑盒子（没有嵌入、没有玻璃面板厚度），
 *   再叠两层同心圆环（metal 448 面 + metal 384 面）当炉头 —— 远看像两个「靶心」，
 *   没有炉盖 / 炉架 / 旋钮，也没有灶具与台面之间的嵌装缝。
 *
 * 重建口径：真实 600 双眼燃气灶 —— 20mm 台面开 556 × 310 嵌装孔，8mm 钢化玻璃面板
 * 盖住孔沿，两个炉头（分火器 + 火盖）坐在面板上，铸铁炉架四爪 + 支脚，前缘两个旋钮。
 * 灶具最高点（炉架）落在规格高度 0.908。
 *
 * 槽位（顺序沿用原件，材质名不改）：
 * 0 踢脚 / 1 柜体 / 2 台面 / 3 玻璃灶面 / 4 柜门 / 5 灶体与炉头底座 / 6 火盖与炉架 / 7 旋钮。
 */
import { box, cylinder, merge, transform } from '../lib/primitive-kit.mjs'
import {
  baseCabinet,
  counterWithOpening,
  BODY_DEPTH,
} from '../lib/kitchen-parts.mjs'

export const spec = { size: [1.224, 0.908, 0.648], mount: 'floor', topologyClass: 'solid' }

const WIDTH = 1.224
const DEPTH = 0.648
const COUNTER_TOP = 0.85
const COUNTER_T = 0.02
const COUNTER_BOTTOM = COUNTER_TOP - COUNTER_T

/** 台面嵌装孔；玻璃面板四周各压住孔沿 10mm。 */
const OPENING_W = 0.556
const OPENING_D = 0.31
const PANEL_W = 0.576
const PANEL_D = 0.35
const PANEL_T = 0.008

const BURNER_X = 0.135
const PANEL_TOP = COUNTER_TOP + PANEL_T
const GRATE_TOP = 0.9075

function hobPanel() {
  // 钢化玻璃面板：底面坐在台面上，四周盖住嵌装孔。
  return box({
    width: PANEL_W,
    height: PANEL_T,
    depth: PANEL_D,
    center: [0, COUNTER_TOP + PANEL_T / 2, 0],
  })
}

/** 灶体：从台面下伸进嵌装孔的金属箱体 + 两个炉头底座。 */
function hobBody() {
  const shell = box({
    width: OPENING_W - 0.02,
    height: 0.062,
    depth: OPENING_D - 0.02,
    center: [0, COUNTER_TOP - 0.031, 0],
  })
  const bases = merge(
    [-BURNER_X, BURNER_X].map((x) =>
      cylinder({
        radiusTop: 0.058,
        height: 0.01,
        segments: 28,
        center: [x, PANEL_TOP + 0.005, 0],
      }),
    ),
  )
  return merge([shell, bases])
}

/** 火盖（外圈 + 内圈）与铸铁炉架（四爪 + 四个支脚）。 */
function burners() {
  const caps = merge(
    [-BURNER_X, BURNER_X].flatMap((x) => [
      cylinder({ radiusTop: 0.04, height: 0.008, segments: 28, center: [x, PANEL_TOP + 0.014, 0] }),
      cylinder({ radiusTop: 0.02, height: 0.006, segments: 20, center: [x, PANEL_TOP + 0.021, 0] }),
    ]),
  )

  const arm = box({ width: 0.11, height: 0.0125, depth: 0.016 })
  const post = box({ width: 0.012, height: 0.037, depth: 0.012 })
  const grates = merge(
    [-BURNER_X, BURNER_X].flatMap((cx) =>
      [45, 135, 225, 315].flatMap((degrees) => {
        const angle = (degrees * Math.PI) / 180
        const dx = Math.cos(angle)
        const dz = -Math.sin(angle)
        return [
          transform(arm, {
            rotateY: angle,
            translate: [cx + dx * 0.048, GRATE_TOP - 0.00625, dz * 0.048],
          }),
          transform(post, {
            rotateY: angle,
            translate: [cx + dx * 0.095, PANEL_TOP + 0.0185, dz * 0.095],
          }),
        ]
      }),
    ),
  )
  return merge([caps, grates])
}

/** 前缘两个旋钮（圆柱 + 指针凸筋）。 */
function knobs() {
  const knob = cylinder({ radiusTop: 0.017, height: 0.016, segments: 20 })
  const pointer = box({ width: 0.014, height: 0.003, depth: 0.004 })
  return merge(
    [-0.1, 0.1].flatMap((x) => [
      transform(knob, { translate: [x, PANEL_TOP + 0.008, 0.138] }),
      transform(pointer, { translate: [x + 0.005, PANEL_TOP + 0.0175, 0.138] }),
    ]),
  )
}

export function build() {
  // 开顶：灶体要从台面嵌装孔往柜内吊 62mm，整块顶板会横穿灶体。
  const { plinth, carcass, doors, handles } = baseCabinet({
    width: 1.2,
    carcassTop: COUNTER_BOTTOM,
    bodyDepth: BODY_DEPTH,
    openTop: true,
  })

  const counter = counterWithOpening({
    width: WIDTH,
    depth: DEPTH,
    topY: COUNTER_TOP,
    thickness: COUNTER_T,
    openingWidth: OPENING_W,
    openingDepth: OPENING_D,
  }).geometry

  return {
    groups: [
      { name: 'kitchencooktop-base', material: 0, geometry: plinth },
      { name: 'kitchencooktop-body', material: 1, geometry: carcass },
      { name: 'kitchencooktop-top', material: 2, geometry: counter },
      { name: 'kitchencooktop-cooktop', material: 3, geometry: hobPanel() },
      { name: 'kitchencooktop-door', material: 4, geometry: doors },
      { name: 'kitchencooktop-metal', material: 5, geometry: hobBody() },
      { name: 'kitchencooktop-metal-2', material: 6, geometry: burners() },
      // 门拉手并进旋钮槽位：两者都是面板上的小件五金（原件该槽位是通长拉手）。
      { name: 'kitchencooktop-metal-3', material: 7, geometry: merge([handles, knobs()]) },
    ],
  }
}
