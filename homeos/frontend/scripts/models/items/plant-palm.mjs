/**
 * `plant-palm`（1083 × 1550 × 1107 mm 散尾葵）参数化重建。
 *
 * 槽位：0 花盆 / 1 托盘 / 2 主干 / 3 叶片 / 4 浅色叶片。
 * 原模型高度只有规格的 70%，且所有叶子共面；这里按「盆 0.42 / 主干到 1.1 / 叶冠到 1.55」重建。
 */
import { cylinder, merge, transform } from '../lib/primitive-kit.mjs'
import { axisScale, b } from '../lib/parts.mjs'

export const spec = { size: [1.0834, 1.55, 1.1074], mount: 'floor', topologyClass: 'open-sheet' }

const H = 1.55
const POT_H = 0.42
const POT_R = 0.22
const CROWN = 1.02

const pot = merge([
  cylinder({ radiusTop: POT_R, radiusBottom: POT_R * 0.76, height: POT_H, segments: 32, center: [0, POT_H / 2 + 0.014, 0] }),
  cylinder({ radiusTop: POT_R + 0.01, height: 0.03, segments: 32, center: [0, POT_H, 0] }),
])
const saucer = cylinder({ radiusTop: POT_R + 0.025, height: 0.014, segments: 32, center: [0, 0.007, 0] })

const trunk = merge(
  [0, 1, 2].map((index) =>
    transform(cylinder({ radiusTop: 0.03, radiusBottom: 0.04, height: CROWN - POT_H + 0.06, segments: 10 }), {
      rotateZ: (index - 1) * 0.08,
      rotateX: (index - 1) * 0.05,
      translate: [Math.cos(index * 2.1) * 0.05, (CROWN + POT_H) / 2, Math.sin(index * 2.1) * 0.05],
    }),
  ),
)

/** 羽状叶：一根叶轴 + 若干斜向小羽片，越靠叶尖越短。 */
function frond({ angle, tilt, length, height, light = false }) {
  const shaft = b(0.02, 0.008, length, 0, 0, -length / 2)
  const pinnae = Array.from({ length: 7 }, (_, index) => {
    const t = (index + 1) / 8
    const size = 0.16 * (1 - t * 0.6)
    return merge([
      transform(b(size, 0.006, 0.03), {
        rotateY: 0.6,
        translate: [size / 2, 0, -length * t],
      }),
      transform(b(size, 0.006, 0.03), {
        rotateY: -0.6,
        translate: [-size / 2, 0, -length * t],
      }),
    ])
  })
  return transform(merge([shaft, ...pinnae]), {
    rotateY: angle,
    rotateX: tilt,
    translate: [light ? 0.03 : -0.03, height, light ? 0.03 : -0.03],
  })
}

const leaves = axisScale(merge(
  Array.from({ length: 7 }, (_, index) => {
    const angle = (index / 7) * Math.PI * 2 + 0.25
    return frond({
      angle,
      tilt: 0.24 + (index % 3) * 0.08,
      length: 0.66 - (index % 2) * 0.06,
      height: H - 0.2 - (index % 3) * 0.05,
    })
  }),
), [1, 1, 0.92])
const youngLeaves = axisScale(merge(
  Array.from({ length: 3 }, (_, index) =>
    frond({
      angle: index * 2.0 + 0.9,
      tilt: 0.14,
      length: 0.46,
      height: H - 0.06,
      light: true,
    }),
  ),
), [1, 1, 0.92])

export function build() {
  return {
    groups: [
      { name: 'plant-palm-pot', material: 0, geometry: pot },
      { name: 'plant-palm-saucer', material: 1, geometry: saucer },
      { name: 'plant-palm-stem', material: 2, geometry: trunk },
      { name: 'plant-palm-foliage', material: 3, geometry: leaves },
      { name: 'plant-palm-young', material: 4, geometry: youngLeaves },
    ],
  }
}
