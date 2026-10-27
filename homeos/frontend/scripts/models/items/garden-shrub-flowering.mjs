/**
 * 开花灌木（1.05 × 0.8 × 0.9）
 *
 * 参照：绣球 / 锦带花 / 月季丛
 * - 冠层 10 个大叶簇 + 4 个受光叶簇；花不是「顶部一个共面圆盘」，
 *   而是 26 朵花 + 8 个花苞分布在冠面球壳上（含侧面与下方），大小随机；
 * - 花径 6–9cm（成簇的绣球）到 3–4cm（月季），花心比花瓣深一档；
 * - 冠幅 1.0m、高 0.8m，冠底贴地，细枝从基部放射。
 *
 * 槽位：1 light=受光叶 / 2 dark=细枝(branch) / 3 leaf=主叶 / 5 accent=花。
 */
import { merge } from '../lib/primitive-kit.mjs'
import { add, fitGroups, flowerCluster, random, scatterBlobs, tubeChain } from '../lib/garden-parts.mjs'

const SIZE = [1.05, 0.8, 0.9]

export const spec = {
  size: SIZE,
  mount: 'floor',
  topologyClass: 'solid',
}

export function build() {
  const rng = random(20261027)

  const twigs = merge(
    [0, 1, 2, 3, 4, 5].map((index) => {
      const angle = (index / 6) * Math.PI * 2 + rng() * 0.4
      const reach = 0.24 + rng() * 0.12
      return tubeChain({
        points: [
          [Math.cos(angle) * 0.03, 0, Math.sin(angle) * 0.03],
          [Math.cos(angle) * reach * 0.65, 0.22, Math.sin(angle) * reach * 0.65],
          [Math.cos(angle) * reach, 0.34 + rng() * 0.1, Math.sin(angle) * reach],
        ],
        radii: [0.013, 0.007, 0.003],
        segments: 4,
      })
    }),
  )

  const leaves = scatterBlobs({
    center: [0, 0.26, 0],
    radii: [0.34, 0.3, 0.31],
    count: 10,
    blobSize: 0.17,
    seed: 121,
    segments: 8,
    rings: 5,
    inner: 0.48,
    flatten: 0.86,
    jitter: 0.36,
  })

  const youngLeaves = scatterBlobs({
    center: [0.02, 0.36, 0.01],
    radii: [0.34, 0.26, 0.3],
    count: 4,
    blobSize: 0.1,
    seed: 123,
    segments: 7,
    rings: 4,
    inner: 0.9,
    flatten: 0.72,
  })

  // 花：分布在冠面球壳（含侧面与下方），26 朵 + 8 个花苞，避免「共面花盘」。
  const crownCenter = [0, 0.32, 0]
  const crownRadii = [0.4, 0.36, 0.35]
  const flowers = []
  const buds = []
  for (let index = 0; index < 34; index += 1) {
    const z = -1 + rng() * 2
    const theta = rng() * Math.PI * 2
    const ring = Math.sqrt(Math.max(0, 1 - z * z))
    const radial = 0.9 + rng() * 0.14
    const point = add(crownCenter, [
      Math.cos(theta) * ring * crownRadii[0] * radial,
      z * crownRadii[1] * radial,
      Math.sin(theta) * ring * crownRadii[2] * radial,
    ])
    if (index < 26) {
      const size = 0.032 + rng() * 0.022
      flowers.push(flowerCluster({ center: point, radius: size, seed: 200 + index }))
    } else {
      const size = 0.018 + rng() * 0.01
      buds.push(
        flowerCluster({
          center: add(point, [rng() * 0.01 - 0.005, 0.02, rng() * 0.01 - 0.005]),
          radius: size,
          seed: 300 + index,
        }),
      )
    }
  }

  return {
    groups: fitGroups(
      [
        { name: 'garden-shrub-flowering-light', material: 1, geometry: youngLeaves },
        { name: 'garden-shrub-flowering-branch', material: 2, geometry: twigs },
        { name: 'garden-shrub-flowering-leaf', material: 3, geometry: leaves },
        { name: 'garden-shrub-flowering-accent', material: 5, geometry: merge([...flowers, ...buds]) },
      ],
      SIZE,
    ),
  }
}
