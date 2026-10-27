/**
 * 低矮圆灌木（0.95 × 0.65 × 0.85）
 *
 * 参照：修剪成球的黄杨 / 小叶女贞（Buxus 球）
 * - 高 : 宽 ≈ 0.68（0.65m 高 / 0.95m 宽），旧版 0.48m 高是压扁的饼；
 * - 半球冠：10 个大叶簇 + 4 个小叶簇，顶部有 3–4cm 起伏，不出现平顶；
 * - 冠底 6cm 内收，落地处能看到土面。
 *
 * 槽位：1 light=受光叶 / 2 dark=细枝(branch) / 3 leaf=主叶。
 */
import { merge } from '../lib/primitive-kit.mjs'
import { fitGroups, scatterBlobs, tubeChain } from '../lib/garden-parts.mjs'

const SIZE = [0.95, 0.65, 0.85]

export const spec = {
  size: SIZE,
  mount: 'floor',
  topologyClass: 'solid',
}

export function build() {
  const twigs = merge(
    [0, 1, 2, 3, 4].map((index) => {
      const angle = (index / 5) * Math.PI * 2
      return tubeChain({
        points: [
          [Math.cos(angle) * 0.03, 0, Math.sin(angle) * 0.03],
          [Math.cos(angle) * 0.2, 0.2, Math.sin(angle) * 0.2],
        ],
        radii: [0.012, 0.004],
        segments: 4,
      })
    }),
  )

  const leaves = scatterBlobs({
    center: [0, 0.22, 0],
    radii: [0.31, 0.27, 0.29],
    count: 11,
    blobSize: 0.17,
    seed: 111,
    segments: 10,
    rings: 6,
    inner: 0.45,
    flatten: 0.9,
    jitter: 0.32,
  })

  const clusters = scatterBlobs({
    center: [0, 0.26, 0],
    radii: [0.36, 0.28, 0.34],
    count: 5,
    blobSize: 0.12,
    seed: 112,
    segments: 9,
    rings: 5,
    inner: 0.88,
    flatten: 0.8,
  })

  const youngLeaves = scatterBlobs({
    center: [0.01, 0.32, 0.01],
    radii: [0.3, 0.2, 0.28],
    count: 4,
    blobSize: 0.09,
    seed: 113,
    segments: 8,
    rings: 5,
    inner: 0.9,
    flatten: 0.75,
  })

  return {
    groups: fitGroups(
      [
        { name: 'garden-shrub-low-light', material: 1, geometry: youngLeaves },
        { name: 'garden-shrub-low-branch', material: 2, geometry: twigs },
        { name: 'garden-shrub-low-leaf', material: 3, geometry: merge([leaves, clusters]) },
      ],
      SIZE,
    ),
  }
}
