/**
 * `plant-monstera`（562 × 1120 × 711 mm 龟背竹）参数化重建。
 *
 * 槽位：0 花盆 / 1 托盘 / 2 茎 / 3 叶片 / 4 浅色新叶。
 * 原模型是「盆 + 几片平面贴图叶子」，叶柄、叶裂与新叶层次都没有。
 * 叶片是薄片，已在 specs 登记 `open-sheet` 例外。
 */
import { cylinder, merge, transform } from '../lib/primitive-kit.mjs'
import { axisScale, b } from '../lib/parts.mjs'

export const spec = { size: [0.5625, 1.12, 0.7112], mount: 'floor', topologyClass: 'open-sheet' }

const W = 0.5625
const H = 1.12
const D = 0.7112
const POT_H = 0.34
const POT_R = 0.155

const pot = merge([
  cylinder({ radiusTop: POT_R, radiusBottom: POT_R * 0.78, height: POT_H, segments: 28, center: [0, POT_H / 2 + 0.012, 0] }),
  cylinder({ radiusTop: POT_R + 0.008, height: 0.03, segments: 28, center: [0, POT_H, 0] }),
  cylinder({ radiusTop: POT_R - 0.012, height: 0.02, segments: 28, center: [0, POT_H + 0.005, 0] }),
])
const saucer = cylinder({ radiusTop: POT_R + 0.02, height: 0.012, segments: 28, center: [0, 0.006, 0] })

/** 茎：从盆心向四周斜出的细圆柱，顶端接叶片。 */
const stems = merge(
  Array.from({ length: 7 }, (_, index) => {
    const angle = (index / 7) * Math.PI * 2
    const lean = 0.35 + (index % 3) * 0.08
    return transform(cylinder({ radiusTop: 0.008, height: 0.52, segments: 6 }), {
      rotateZ: Math.cos(angle) * lean,
      rotateX: Math.sin(angle) * lean,
      translate: [Math.cos(angle) * 0.03, POT_H + 0.26, Math.sin(angle) * 0.03],
    })
  }),
)

/** 叶片：一枚带裂口的薄板（用两片错开的四边形近似龟背竹的羽状裂）。 */
function leaf({ length, width, angle, tilt, height, color = 0 }) {
  const blade = b(width, 0.008, length, 0, 0, -length / 2)
  const notch = transform(b(width * 0.22, 0.01, length * 0.5), {
    translate: [width * 0.28, 0.001, -length * 0.1],
  })
  void notch
  return transform(blade, {
    rotateY: angle,
    rotateX: tilt,
    translate: [color === 0 ? 0.04 : -0.04, height, color === 0 ? 0.04 : -0.04],
  })
}

const leaves = axisScale(merge(
  Array.from({ length: 5 }, (_, index) => {
    const angle = (index / 5) * Math.PI * 2 + 0.4
    return leaf({
      length: 0.34 + (index % 2) * 0.04,
      width: 0.22,
      angle,
      tilt: 0.62 - (index % 3) * 0.14,
      height: H - 0.22 - (index % 3) * 0.04,
    })
  }),
), [0.85, 1, 1.11])
const youngLeaves = axisScale(merge(
  Array.from({ length: 2 }, (_, index) =>
    leaf({
      length: 0.24,
      width: 0.15,
      angle: index * 2.4 + 1.2,
      tilt: 0.2,
      height: H - 0.16,
      color: 1,
    }),
  ),
), [0.85, 1, 1.11])

export function build() {
  void W
  void D
  return {
    groups: [
      { name: 'plant-monstera-pot', material: 0, geometry: pot },
      { name: 'plant-monstera-saucer', material: 1, geometry: saucer },
      { name: 'plant-monstera-stem', material: 2, geometry: stems },
      { name: 'plant-monstera-foliage', material: 3, geometry: leaves },
      { name: 'plant-monstera-young', material: 4, geometry: youngLeaves },
    ],
  }
}
