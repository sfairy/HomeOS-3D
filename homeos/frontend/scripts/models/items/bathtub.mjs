/**
 * `bathtub`（1700 × 580 × 780 mm 独立浴缸）参数化重建。
 *
 * 槽位：0 陶瓷缸体 / 1 龙头 / 2 缸沿。
 * 原模型是「一个实心盒子」，缸壁厚度、内胆与缸沿都是贴图。
 */
import { cylinder, merge, transform } from '../lib/primitive-kit.mjs'
import { b } from '../lib/parts.mjs'

export const spec = { size: [1.7, 0.58, 0.78], mount: 'floor', topologyClass: 'solid' }

const W = 1.7
const H = 0.58
const D = 0.78
const WALL = 0.07
const FLOOR_T = 0.09
const RIM_T = 0.04
const INNER_H = H - RIM_T - FLOOR_T

const outerWalls = merge([
  b(WALL, H - FLOOR_T, D, -(W - WALL) / 2, (H - FLOOR_T) / 2 + FLOOR_T, 0),
  b(WALL, H - FLOOR_T, D, (W - WALL) / 2, (H - FLOOR_T) / 2 + FLOOR_T, 0),
  b(W - WALL * 2, H - FLOOR_T, WALL, 0, (H - FLOOR_T) / 2 + FLOOR_T, -(D - WALL) / 2),
  b(W - WALL * 2, H - FLOOR_T, WALL, 0, (H - FLOOR_T) / 2 + FLOOR_T, (D - WALL) / 2),
])
const floor = b(W - WALL * 2, FLOOR_T, D - WALL * 2, 0, FLOOR_T / 2, 0)
/** 内胆：比外壁低 4cm 的浅槽，制造「缸壁厚度」的读感。 */
const inner = b(W - WALL * 2 - 0.01, INNER_H, D - WALL * 2 - 0.01, 0, INNER_H / 2 + FLOOR_T, 0)
const rim = merge([
  b(W, RIM_T, D, 0, H - RIM_T / 2, 0),
  b(W - WALL * 2 - 0.02, 0.02, D - WALL * 2 - 0.02, 0, H - RIM_T - 0.01, 0),
])
const faucet = merge([
  transform(cylinder({ radiusTop: 0.02, height: 0.14, segments: 16 }), {
    translate: [-W / 2 + 0.3, 0.4, -D / 2 + 0.14],
  }),
  transform(cylinder({ radiusTop: 0.012, height: 0.14, segments: 12 }), {
    rotateX: Math.PI / 2,
    translate: [-W / 2 + 0.3, 0.46, -D / 2 + 0.2],
  }),
])

export function build() {
  return {
    groups: [
      { name: 'bathtub-ceramic', material: 0, geometry: merge([outerWalls, floor, inner]) },
      { name: 'bathtub-faucet', material: 1, geometry: faucet },
      { name: 'bathtub-rim', material: 2, geometry: rim },
    ],
  }
}
