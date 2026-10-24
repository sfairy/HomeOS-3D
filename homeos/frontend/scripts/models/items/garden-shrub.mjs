/**
 * 灌木丛（0.95 × 0.72 × 0.85）
 *
 * 参照：无主干的丛生花灌木（绣线菊 / 棣棠 / 六道木）
 * - 没有「树干」：6 根 1–1.5cm 的细枝从基部放射出去，枝尖落在冠面 0.4–0.55m；
 * - 冠层是 12 个大叶簇 + 5 个小叶簇铺的半球，中心也有叶，不从底下看见空腔；
 * - 旧版把「内部树干」做成 0.53m、占整株 74% 的粗桩，是这批里最明显的比例错误。
 *
 * 槽位：0 base=空（灌木无主干）/ 1 light=受光叶 / 2 dark=细枝(branch) / 3 leaf=主叶。
 */
import { merge } from '../lib/primitive-kit.mjs'
import { fitGroups, random, scatterBlobs, tubeChain } from '../lib/garden-parts.mjs'

const SIZE = [0.95, 0.72, 0.85]

export const spec = {
  size: SIZE,
  mount: 'floor',
  topologyClass: 'open-sheet',
}

export function build() {
  const rng = random(20261026)

  // 细枝：6 根，从基部放射，枝尖在冠面下 5–10cm。
  const twigs = []
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2 + rng() * 0.5
    const reach = 0.22 + rng() * 0.14
    twigs.push(
      tubeChain({
        points: [
          [Math.cos(angle) * 0.02, 0, Math.sin(angle) * 0.02],
          [Math.cos(angle) * reach * 0.6, 0.22 + rng() * 0.1, Math.sin(angle) * reach * 0.6],
          [Math.cos(angle) * reach, 0.36 + rng() * 0.14, Math.sin(angle) * reach],
        ],
        radii: [0.014, 0.008, 0.003],
        segments: 4,
      }),
    )
  }

  const leaves = scatterBlobs({
    center: [0, 0.24, 0],
    radii: [0.32, 0.3, 0.3],
    count: 14,
    blobSize: 0.17,
    seed: 101,
    segments: 10,
    rings: 6,
    inner: 0.45,
    flatten: 0.86,
    jitter: 0.36,
  })

  const clusters = scatterBlobs({
    center: [0, 0.26, 0],
    radii: [0.38, 0.32, 0.34],
    count: 6,
    blobSize: 0.12,
    seed: 102,
    segments: 9,
    rings: 5,
    inner: 0.9,
    flatten: 0.75,
    jitter: 0.4,
  })

  const youngLeaves = scatterBlobs({
    center: [0.02, 0.34, 0.01],
    radii: [0.32, 0.24, 0.3],
    count: 5,
    blobSize: 0.1,
    seed: 103,
    segments: 9,
    rings: 5,
    inner: 0.9,
    flatten: 0.7,
  })

  return {
    groups: fitGroups(
      [
        { name: 'garden-shrub-light', material: 1, geometry: youngLeaves },
        { name: 'garden-shrub-branch', material: 2, geometry: merge(twigs) },
        { name: 'garden-shrub-leaf', material: 3, geometry: merge([leaves, clusters]) },
      ],
      SIZE,
    ),
  }
}
