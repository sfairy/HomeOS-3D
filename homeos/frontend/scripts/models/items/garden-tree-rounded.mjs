/**
 * 圆冠乔木（2.1 × 3.0 × 2.1）
 *
 * 参照：球形冠的景观阔叶树（椴树 / 枫杨 / 球形修剪的榆树）
 * - 净干高 1.2–1.4m，冠高 : 冠宽 ≈ 0.85，冠形接近正球；
 * - 树干笔直（不摆动），只在冠内分 3 根短主枝；
 * - 14 个大叶簇 + 8 个次级叶簇，叶簇沿球壳分布，冠心留空。
 *
 * 槽位：0 base=树干(trunk) / 1 light=受光叶 / 2 dark=分枝(branch) / 3 leaf=主叶。
 */
import { merge } from '../lib/primitive-kit.mjs'
import { fitGroups, scatterBlobs, tubeChain } from '../lib/garden-parts.mjs'

const SIZE = [2.1, 3.0, 2.1]

export const spec = {
  size: SIZE,
  mount: 'floor',
  topologyClass: 'open-sheet',
}

export function build() {
  const trunk = tubeChain({
    points: [
      [0, 0, 0],
      [0.005, 0.7, 0],
      [0.01, 1.5, 0],
      [0, 2.2, 0],
    ],
    radii: [0.075, 0.06, 0.045, 0.028],
    segments: 10,
  })

  // 冠内主枝：短、藏在叶层里，只为让冠心不是空的。
  const branches = [
    tubeChain({
      points: [[0, 1.45, 0], [0.42, 1.95, 0.16], [0.6, 2.25, 0.24]],
      radii: [0.038, 0.024, 0.01],
      segments: 6,
    }),
    tubeChain({
      points: [[0, 1.6, 0], [-0.38, 2.0, 0.3], [-0.52, 2.35, 0.4]],
      radii: [0.034, 0.022, 0.009],
      segments: 6,
    }),
    tubeChain({
      points: [[0, 1.75, 0], [0.1, 2.15, -0.45], [0.14, 2.45, -0.58]],
      radii: [0.03, 0.02, 0.008],
      segments: 6,
    }),
  ]

  const leaves = scatterBlobs({
    center: [0, 2.2, 0],
    radii: [0.78, 0.7, 0.76],
    count: 14,
    blobSize: 0.35,
    seed: 21,
    segments: 10,
    rings: 7,
    inner: 0.58,
    flatten: 0.88,
    jitter: 0.36,
  })

  const clusters = scatterBlobs({
    center: [0, 2.22, 0],
    radii: [0.86, 0.76, 0.84],
    count: 8,
    blobSize: 0.26,
    seed: 22,
    segments: 9,
    rings: 6,
    inner: 0.88,
    flatten: 0.8,
    jitter: 0.4,
  })

  const youngLeaves = scatterBlobs({
    center: [0.04, 2.36, 0.03],
    radii: [0.76, 0.66, 0.72],
    count: 6,
    blobSize: 0.23,
    seed: 23,
    segments: 9,
    rings: 6,
    inner: 0.9,
    flatten: 0.72,
  })

  return {
    groups: fitGroups(
      [
        { name: 'garden-tree-rounded-trunk', material: 0, geometry: trunk },
        { name: 'garden-tree-rounded-light', material: 1, geometry: youngLeaves },
        { name: 'garden-tree-rounded-branch', material: 2, geometry: merge(branches) },
        { name: 'garden-tree-rounded-leaf', material: 3, geometry: merge([leaves, clusters]) },
      ],
      SIZE,
    ),
  }
}
