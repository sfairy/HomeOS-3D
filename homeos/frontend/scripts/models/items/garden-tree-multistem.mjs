/**
 * 多干小乔木（2.1 × 2.6 × 1.8）
 *
 * 参照：丛生茶条槭 / 紫薇 / 丛生柿（3–5 根自基部分叉的干）
 * - 4 根干从基部 0.10–0.16m 处分叉，向外张开到 0.45–0.55m，顶端 1.5–1.9m；
 * - 冠层拆成 4 个独立小冠（每根干一个），冠与冠之间留缝，不做单一球；
 * - 冠幅 2.0m、总高 2.6m，冠层从 1.35m 起。
 *
 * 槽位：0 base=树干(trunk) / 1 light=受光叶 / 2 dark=分枝(branch) / 3 leaf=主叶。
 */
import { merge } from '../lib/primitive-kit.mjs'
import { fitGroups, scatterBlobs, tubeChain } from '../lib/garden-parts.mjs'

const SIZE = [2.1, 2.6, 1.8]

export const spec = {
  size: SIZE,
  mount: 'floor',
  topologyClass: 'solid',
}

export function build() {
  // 4 根干：基部收在中心 0.14m 内，往上张开；各自带一点弯。
  const stems = [
    { angle: 0.4, lean: 0.46, top: 1.72, radius: 0.055 },
    { angle: 2.25, lean: 0.5, top: 1.58, radius: 0.05 },
    { angle: 3.9, lean: 0.44, top: 1.8, radius: 0.048 },
    { angle: 5.5, lean: 0.4, top: 1.62, radius: 0.044 },
  ]
  const trunks = []
  const branches = []
  for (const stem of stems) {
    const dx = Math.cos(stem.angle)
    const dz = Math.sin(stem.angle)
    const top = [dx * stem.lean, stem.top, dz * stem.lean]
    trunks.push(
      tubeChain({
        points: [
          [dx * 0.06, 0, dz * 0.06],
          [dx * stem.lean * 0.45, stem.top * 0.5, dz * stem.lean * 0.45],
          [dx * (stem.lean - 0.03), stem.top * 0.86, dz * (stem.lean - 0.03)],
          top,
        ],
        radii: [stem.radius * 1.5, stem.radius, stem.radius * 0.72, stem.radius * 0.45],
        segments: 8,
      }),
    )
    // 每根干在 1.2–1.5m 处分 2 根小枝
    for (const side of [-0.5, 0.55]) {
      const angle = stem.angle + side
      branches.push(
        tubeChain({
          points: [
            [dx * stem.lean * 0.7, stem.top * 0.72, dz * stem.lean * 0.7],
            [
              dx * stem.lean * 0.7 + Math.cos(angle) * 0.3,
              stem.top * 0.72 + 0.34,
              dz * stem.lean * 0.7 + Math.sin(angle) * 0.3,
            ],
          ],
          radii: [stem.radius * 0.5, stem.radius * 0.18],
          segments: 5,
        }),
      )
    }
  }

  // 每根干一个冠：4 个小冠，冠间有缝。
  const crownSeeds = [41, 42, 43, 44]
  const leaves = merge(
    stems.map((stem, index) => {
      const dx = Math.cos(stem.angle)
      const dz = Math.sin(stem.angle)
      const centerY = stem.top + 0.3
      return merge([
        scatterBlobs({
          center: [dx * stem.lean * 0.95, centerY, dz * stem.lean * 0.95],
          radii: [0.46, 0.34, 0.4],
          count: 5,
          blobSize: 0.28,
          seed: crownSeeds[index],
          segments: 10,
          rings: 6,
          inner: 0.5,
          flatten: 0.8,
          jitter: 0.35,
        }),
      ])
    }),
  )

  const youngLeaves = merge(
    stems.map((stem, index) => {
      const dx = Math.cos(stem.angle)
      const dz = Math.sin(stem.angle)
      return scatterBlobs({
        center: [dx * stem.lean * 0.95, stem.top + 0.44, dz * stem.lean * 0.95],
        radii: [0.4, 0.26, 0.34],
        count: 2,
        blobSize: 0.2,
        seed: 51 + index,
        segments: 9,
        rings: 5,
        inner: 0.9,
        flatten: 0.68,
      })
    }),
  )

  return {
    groups: fitGroups(
      [
        { name: 'garden-tree-multistem-trunk', material: 0, geometry: merge(trunks) },
        { name: 'garden-tree-multistem-light', material: 1, geometry: youngLeaves },
        { name: 'garden-tree-multistem-branch', material: 2, geometry: merge(branches) },
        { name: 'garden-tree-multistem-leaf', material: 3, geometry: leaves },
      ],
      SIZE,
    ),
  }
}
