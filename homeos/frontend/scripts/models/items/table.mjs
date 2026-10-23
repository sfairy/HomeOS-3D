/**
 * `table`（2400 × 820 × 1800 mm 四人餐桌）参数化重建。
 *
 * 槽位：0 桌架 / 1 座垫布料 / 2 椅架。
 * 原模型是一块桌板 + 四条腿，椅子被并进同一个盒子，坐高与桌下净空都不存在。
 */
import { merge, transform } from '../lib/primitive-kit.mjs'
import { b, legs4 } from '../lib/parts.mjs'

export const spec = { size: [2.4, 0.82, 1.8], mount: 'floor', topologyClass: 'solid' }

const W = 2.4
const TOP = 0.06
const TABLE_D = 1.0
const SEAT_TOP = 0.45
const TABLE_TOP = 0.72

const top = b(W, TOP, TABLE_D, 0, TABLE_TOP + TOP / 2, 0)
const tableLegs = legs4({
  width: W,
  depth: TABLE_D,
  height: TABLE_TOP,
  insetX: W / 2 - 0.12,
  insetZ: TABLE_D / 2 - 0.1,
  size: 0.08,
})
const apron = merge([
  b(W - 0.26, 0.08, 0.03, 0, TABLE_TOP - 0.04, TABLE_D / 2 - 0.1),
  b(W - 0.26, 0.08, 0.03, 0, TABLE_TOP - 0.04, -TABLE_D / 2 + 0.1),
  b(0.03, 0.08, TABLE_D - 0.22, W / 2 - 0.12, TABLE_TOP - 0.04, 0),
  b(0.03, 0.08, TABLE_D - 0.22, -W / 2 + 0.12, TABLE_TOP - 0.04, 0),
])

const CHAIR_X = 0.72
const CHAIR_Z = 0.675
const SEAT = 0.45
const chairFrames = []
const chairPads = []
for (const x of [-CHAIR_X, CHAIR_X]) {
  for (const z of [-CHAIR_Z, CHAIR_Z]) {
    const outward = z > 0 ? 1 : -1
    const legs = legs4({
      width: SEAT,
      depth: SEAT,
      height: SEAT_TOP,
      insetX: SEAT / 2 - 0.03,
      insetZ: SEAT / 2 - 0.03,
      size: 0.032,
    })
    chairFrames.push(transform(legs, { translate: [x, 0, z] }))
    chairFrames.push(transform(b(SEAT, 0.04, SEAT, 0, SEAT_TOP, 0), { translate: [x, 0, z] }))
    chairFrames.push(
      transform(b(SEAT, 0.36, 0.032, 0, SEAT_TOP + 0.19, outward * (SEAT / 2 - 0.016)), {
        translate: [x, 0, z],
      }),
    )
    chairPads.push(transform(b(SEAT - 0.03, 0.035, SEAT - 0.03, 0, SEAT_TOP + 0.02, 0), { translate: [x, 0, z] }))
  }
}

export function build() {
  return {
    groups: [
      { name: 'table-frame', material: 0, geometry: merge([top, tableLegs, apron]) },
      { name: 'table-fabric', material: 1, geometry: merge(chairPads) },
      { name: 'table-chair', material: 2, geometry: merge(chairFrames) },
    ],
  }
}
