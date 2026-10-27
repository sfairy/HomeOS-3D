/**
 * 层叠景松（2.0 × 2.9 × 1.65）
 *
 * 参照：造型黑松 / 云片式盆景放大到庭院尺度
 * - 8 片云片沿主干左右交错（不是同心圆），片半径 0.55 → 0.14m；
 * - 冠幅 2.0m、高 2.9m，主干在 1.2m 以下可见，云片之间能看到枝；
 * - 云片厚度 0.12–0.18m，片与片的高差 0.25–0.35m，形成「层叠」而不是「塔」。
 *
 * 槽位：0 base=树干(trunk) / 1 light=受光针叶 / 2 dark=分枝(branch) / 3 leaf=针叶云片。
 */
import { merge } from '../lib/primitive-kit.mjs'
import { cloudPad, fitGroups, scatterBlobs, tubeChain } from '../lib/garden-parts.mjs'

const SIZE = [2.0, 2.9, 1.65]

export const spec = {
  size: SIZE,
  mount: 'floor',
  topologyClass: 'solid',
}

export function build() {
  const trunk = tubeChain({
    points: [
      [0, 0, 0],
      [0.04, 0.8, 0.01],
      [0.02, 1.6, -0.02],
      [0.06, 2.3, 0],
      [0.02, 2.85, 0],
    ],
    radii: [0.1, 0.078, 0.058, 0.04, 0.018],
    segments: 9,
  })

  // 8 层左右交错：片厚 0.09–0.12m、层距 0.26–0.32m、单侧偏心 0.5m ——
  // 「层叠」的可读性靠偏心与空隙，不是靠加厚。
  const padSpecs = [
    { y: 0.95, radius: 0.6, x: -0.46, z: 0.1, thickness: 0.12 },
    { y: 1.24, radius: 0.55, x: 0.5, z: -0.16, thickness: 0.12 },
    { y: 1.52, radius: 0.5, x: -0.54, z: -0.12, thickness: 0.11 },
    { y: 1.8, radius: 0.44, x: 0.52, z: 0.18, thickness: 0.11 },
    { y: 2.06, radius: 0.37, x: -0.42, z: 0.2, thickness: 0.1 },
    { y: 2.3, radius: 0.3, x: 0.34, z: -0.18, thickness: 0.1 },
    { y: 2.53, radius: 0.22, x: -0.22, z: 0.1, thickness: 0.09 },
    { y: 2.74, radius: 0.14, x: 0.11, z: -0.06, thickness: 0.09 },
  ]
  const pads = merge(
    padSpecs.map((pad, index) =>
      cloudPad({
        center: [pad.x, pad.y, pad.z],
        radius: pad.radius,
        thickness: pad.thickness,
        blobs: index < 3 ? 3 : 2,
        seed: 81 + index,
        stretch: 1.3,
        segments: 11,
        rings: 5,
      }),
    ),
  )

  const branches = merge(
    padSpecs.slice(0, 6).map((pad, index) =>
      tubeChain({
        points: [
          [0.03, pad.y - 0.16, 0],
          [pad.x * 0.5, pad.y - 0.05, pad.z * 0.5],
          [pad.x, pad.y, pad.z],
        ],
        radii: [0.03 - index * 0.003, 0.017 - index * 0.002, 0.005],
        segments: 5,
      }),
    ),
  )

  // 受光针叶：逐片贴外缘，保持片间空隙。
  const youngLeaves = merge(
    padSpecs.map((pad, index) =>
      scatterBlobs({
        center: [pad.x + Math.sign(pad.x) * pad.radius * 0.4, pad.y + pad.thickness * 0.8, pad.z + pad.radius * 0.16],
        radii: [pad.radius * 0.3, pad.thickness * 0.5, pad.radius * 0.26],
        count: 2,
        blobSize: pad.radius * 0.3,
        seed: 91 + index,
        segments: 8,
        rings: 5,
        inner: 0.75,
        flatten: 0.5,
      }),
    ),
  )

  return {
    groups: fitGroups(
      [
        { name: 'garden-conifer-layered-trunk', material: 0, geometry: trunk },
        { name: 'garden-conifer-layered-light', material: 1, geometry: youngLeaves },
        { name: 'garden-conifer-layered-branch', material: 2, geometry: branches },
        { name: 'garden-conifer-layered-leaf', material: 3, geometry: pads },
      ],
      SIZE,
    ),
  }
}
