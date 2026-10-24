/**
 * 庭院乔木（2.2 × 3.4 × 2.1）
 *
 * 参照：落叶阔叶庭院树（朴树 / 榉树 / 樱花的骨架比例）
 * - 净干高 1.3–1.6m（全高的 40%–47%），基部直径 0.18m，往上收分到 0.064m；
 * - 5 根主枝从 1.15–1.8m 分出，向上外张 35°–55°，枝端伸进冠层、枝根在冠下可见；
 * - 冠幅 2.1–2.2m、冠层厚约 1.5m，用 14 个大叶簇 + 7 个小叶簇堆出起伏，
 *   叶簇只铺在冠层外缘（内核留空），内膛枝能透出来。
 *
 * 槽位：0 base=树干(trunk) / 1 light=外层受光叶 / 2 dark=分枝(branch) / 3 leaf=主叶。
 */
import { merge } from '../lib/primitive-kit.mjs'
import { fitGroups, random, scatterBlobs, tubeChain } from '../lib/garden-parts.mjs'

const SIZE = [2.2, 3.4, 2.1]

export const spec = {
  size: SIZE,
  mount: 'floor',
  topologyClass: 'open-sheet',
}

export function build() {
  const rng = random(20261024)

  // 树干：一条连续变径管（根部 0.26m → 2.3m 处 0.08m），带 3cm 以内的摆动。
  const trunk = tubeChain({
    points: [
      [0, 0, 0],
      [0.015, 0.55, 0.01],
      [0.03, 1.4, -0.008],
      [0.02, 2.3, 0],
    ],
    radii: [0.09, 0.07, 0.052, 0.032],
    segments: 10,
  })

  // 主枝：5 根，从 1.15–1.8m 分出，三段连续管做轻微弯，枝根在冠层下方露出来。
  const branches = []
  const branchSpecs = [
    { y: 1.15, angle: 0.35, length: 0.88, rise: 1.05, radius: 0.042 },
    { y: 1.35, angle: 1.9, length: 0.8, rise: 0.92, radius: 0.038 },
    { y: 1.5, angle: 3.4, length: 0.9, rise: 0.86, radius: 0.036 },
    { y: 1.65, angle: 4.9, length: 0.78, rise: 0.78, radius: 0.031 },
    { y: 1.8, angle: 0.85, length: 0.62, rise: 0.68, radius: 0.026 },
  ]
  for (const branch of branchSpecs) {
    const start = [0.02, branch.y, 0]
    const reach = branch.length
    const mid = [
      Math.cos(branch.angle) * reach * 0.5,
      branch.y + branch.rise * 0.52,
      Math.sin(branch.angle) * reach * 0.5,
    ]
    const end = [
      Math.cos(branch.angle) * reach,
      branch.y + branch.rise,
      Math.sin(branch.angle) * reach,
    ]
    branches.push(
      tubeChain({
        points: [start, mid, end],
        radii: [branch.radius, branch.radius * 0.62, branch.radius * 0.2],
        segments: 6,
      }),
    )
  }

  // 内膛短枝：树冠内部也不是空的，剪口枝能让冠层有层次。
  const twigs = []
  for (let index = 0; index < 5; index += 1) {
    const angle = rng() * Math.PI * 2
    const y = 1.55 + rng() * 0.55
    twigs.push(
      tubeChain({
        points: [
          [0.015, y, 0],
          [Math.cos(angle) * 0.3, y + 0.24 + rng() * 0.16, Math.sin(angle) * 0.3],
        ],
        radii: [0.014, 0.005],
        segments: 4,
      }),
    )
  }

  // 主叶：14 个大叶簇铺冠层外缘（内核留空，枝能透出来）。
  const leaves = scatterBlobs({
    center: [0.02, 2.55, 0],
    radii: [0.78, 0.6, 0.72],
    count: 14,
    blobSize: 0.36,
    seed: 11,
    segments: 10,
    rings: 7,
    inner: 0.6,
    flatten: 0.82,
    jitter: 0.4,
  })

  // 次级叶簇：打散主叶簇的球形轮廓，避免「一颗花椰菜」。
  const clusters = scatterBlobs({
    center: [0.03, 2.62, 0.02],
    radii: [0.84, 0.58, 0.78],
    count: 7,
    blobSize: 0.27,
    seed: 13,
    segments: 9,
    rings: 6,
    inner: 0.86,
    flatten: 0.7,
    jitter: 0.45,
  })

  // 受光叶：冠层外缘上方，浅一档。
  const youngLeaves = scatterBlobs({
    center: [0.06, 2.78, 0.03],
    radii: [0.72, 0.44, 0.66],
    count: 6,
    blobSize: 0.24,
    seed: 12,
    segments: 9,
    rings: 6,
    inner: 0.88,
    flatten: 0.66,
  })

  return {
    groups: fitGroups(
      [
        { name: 'garden-tree-trunk', material: 0, geometry: trunk },
        { name: 'garden-tree-light', material: 1, geometry: youngLeaves },
        { name: 'garden-tree-branch', material: 2, geometry: merge([...branches, ...twigs]) },
        { name: 'garden-tree-leaf', material: 3, geometry: merge([leaves, clusters]) },
      ],
      SIZE,
    ),
  }
}
