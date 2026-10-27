/**
 * 景观松树（1.5 × 3.0 × 1.5）
 *
 * 参照：黑松 / 油松（自然型，非圣诞树圆锥）
 * - 主干微倾（3m 高处偏 10cm），下段 0–0.9m 裸露，往上 7 片水平「云片」；
 * - 云片半径自下而上 0.6 → 0.12m，片厚 0.12–0.16m，左右错位、片间留空；
 * - 5 根可见枝把云片接到主干上 —— 松树的识别度在「层云 + 露枝」，
 *   旧版 3 个圆锥（叶部仅 60 面）是整批里最不像的一款。
 *
 * 槽位：0 base=树干(trunk) / 1 light=受光针叶 / 2 dark=分枝(branch) / 3 leaf=针叶云片。
 */
import { merge } from '../lib/primitive-kit.mjs'
import { cloudPad, fitGroups, scatterBlobs, tubeChain } from '../lib/garden-parts.mjs'

const SIZE = [1.5, 3.0, 1.5]

export const spec = {
  size: SIZE,
  mount: 'floor',
  topologyClass: 'solid',
}

export function build() {
  const trunk = tubeChain({
    points: [
      [0, 0, 0],
      [0.02, 0.9, 0.01],
      [0.06, 1.85, -0.02],
      [0.1, 2.95, 0],
    ],
    radii: [0.095, 0.072, 0.05, 0.022],
    segments: 9,
  })

  // 云片：高度 / 半径 / 偏心（左右不对称是自然松的关键）。
  // 片与片的垂直间距 ≥ 0.38m、片厚 ≤ 0.14m —— 间距比片厚大一倍以上，层间才透得过去；
  // 片一厚、层一密，7 片云就会糊成一团，读不出「松」。
  const padSpecs = [
    { y: 0.95, radius: 0.6, x: -0.1, z: 0.08, thickness: 0.14 },
    { y: 1.38, radius: 0.54, x: 0.15, z: -0.1, thickness: 0.13 },
    { y: 1.79, radius: 0.46, x: -0.17, z: -0.06, thickness: 0.13 },
    { y: 2.16, radius: 0.38, x: 0.17, z: 0.08, thickness: 0.12 },
    { y: 2.5, radius: 0.29, x: -0.13, z: 0.06, thickness: 0.11 },
    { y: 2.78, radius: 0.2, x: 0.1, z: -0.05, thickness: 0.1 },
    { y: 2.98, radius: 0.12, x: -0.04, z: 0.02, thickness: 0.09 },
  ]
  const pads = merge(
    padSpecs.map((pad, index) =>
      cloudPad({
        center: [pad.x, pad.y, pad.z],
        radius: pad.radius,
        thickness: pad.thickness,
        // 片内 2–3 个叶团、水平外伸比 1.35：云片要「扁而宽」，不是一串球。
        blobs: index < 4 ? 3 : 2,
        seed: 61 + index,
        stretch: 1.35,
        segments: 11,
        rings: 5,
      }),
    ),
  )

  // 可见枝：从主干伸到云片中心，直径 3–4cm。
  const branches = merge(
    padSpecs.slice(0, 5).map((pad, index) =>
      tubeChain({
        points: [
          [0.03 + index * 0.012, pad.y - 0.12, 0],
          [pad.x * 0.55, pad.y - 0.04, pad.z * 0.55],
          [pad.x, pad.y, pad.z],
        ],
        radii: [0.028 - index * 0.003, 0.018 - index * 0.002, 0.006],
        segments: 5,
      }),
    ),
  )

  // 受光针叶：贴在每片云片的向阳外缘（不是在整株上竖向撒一条带 ——
  // 竖向叶带会把层间的空隙填满，云片就分不开了）。
  const youngLeaves = merge(
    padSpecs.map((pad, index) =>
      scatterBlobs({
        center: [pad.x + pad.radius * 0.42, pad.y + pad.thickness * 0.8, pad.z + pad.radius * 0.18],
        radii: [pad.radius * 0.34, pad.thickness * 0.5, pad.radius * 0.28],
        count: 2,
        blobSize: pad.radius * 0.3,
        seed: 71 + index,
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
        { name: 'garden-conifer-trunk', material: 0, geometry: trunk },
        { name: 'garden-conifer-light', material: 1, geometry: youngLeaves },
        { name: 'garden-conifer-branch', material: 2, geometry: branches },
        { name: 'garden-conifer-leaf', material: 3, geometry: pads },
      ],
      SIZE,
    ),
  }
}
