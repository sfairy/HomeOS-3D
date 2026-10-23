/**
 * `chair`（500 × 860 × 500 mm 餐椅）参数化重建。
 *
 * 槽位：0 木架 / 1 软包（坐垫 + 靠背垫）。原模型是一座「椅子形状的盒子」，
 * 靠背、座面、腿部没有分离，坐高 0.45m 也看不出来。
 */
import { merge, transform } from '../lib/primitive-kit.mjs'
import { b, legs4 } from '../lib/parts.mjs'

export const spec = { size: [0.5, 0.86, 0.5], mount: 'floor', topologyClass: 'solid' }

const W = 0.5
const H = 0.86
const D = 0.5
const SEAT_TOP = 0.45
const POST = 0.035

const legs = legs4({
  width: W,
  depth: D,
  height: SEAT_TOP,
  insetX: W / 2 - POST / 2,
  insetZ: D / 2 - POST / 2,
  size: POST,
})
const seatFrame = b(W, 0.04, D, 0, SEAT_TOP - 0.02, 0)
const backPosts = merge(
  [-1, 1].map((side) =>
    b(POST, H - SEAT_TOP, POST, (side * (W - POST)) / 2, (H + SEAT_TOP) / 2, -D / 2 + POST / 2),
  ),
)
const backRails = merge([
  b(W - POST * 2, 0.05, POST, 0, 0.62, -D / 2 + POST / 2),
  b(W - POST * 2, 0.05, POST, 0, 0.78, -D / 2 + POST / 2),
  b(W - POST * 2, 0.06, POST, 0, H - 0.04, -D / 2 + POST / 2),
])
const stretcher = b(W - POST * 2, 0.03, 0.03, 0, 0.16, -D / 2 + POST / 2)

const seatPad = b(W - 0.05, 0.045, D - 0.06, 0, SEAT_TOP + 0.014, 0.012)
const backPad = transform(b(W - 0.07, 0.3, 0.03), {
  translate: [0, (SEAT_TOP + H) / 2, -D / 2 + POST + 0.016],
})

export function build() {
  return {
    groups: [
      { name: 'chair-frame', material: 0, geometry: merge([legs, seatFrame, backPosts, backRails, stretcher]) },
      { name: 'chair-fabric', material: 1, geometry: merge([seatPad, backPad]) },
    ],
  }
}
