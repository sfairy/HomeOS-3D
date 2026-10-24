/**
 * 丛生草（0.75 × 0.8 × 0.65）
 *
 * 参照：蓝羊茅 / 狼尾草 / 芒草（观赏草组团）
 * - 56 片弯曲叶从基部 4cm 的圆心放射，叶长 0.45–0.8m，向外倾 10°–45°；
 * - 叶宽 2.0–3.0cm，叶尖收细、向地面弯（不是直线插片）；
 * - 8 个草穗高出叶丛 10–20cm，穗色用干花材质（浅褐），是观赏草的识别点。
 *
 * 槽位：1 light=嫩叶 / 3 leaf=主叶 / 5 accent=草穗。
 */
import { merge } from '../lib/primitive-kit.mjs'
import { between, blade, fitGroups, random, seedHead } from '../lib/garden-parts.mjs'

const SIZE = [0.75, 0.8, 0.65]

export const spec = {
  size: SIZE,
  mount: 'floor',
  topologyClass: 'open-sheet',
}

export function build() {
  const rng = random(20261030)
  const leaves = []
  const youngLeaves = []

  for (let index = 0; index < 56; index += 1) {
    const angle = rng() * Math.PI * 2
    const rootRadius = 0.02 + rng() * 0.03
    const length = 0.42 + rng() * 0.34
    const geometry = blade({
      length,
      width: 0.02 + rng() * 0.01,
      curve: 0.28 + rng() * 0.3,
      segments: 2,
      thickness: 0.004,
      translate: [Math.cos(angle) * rootRadius, 0, Math.sin(angle) * rootRadius],
      rotateX: 0.18 + rng() * 0.55,
      rotateY: angle,
      rotateZ: between(rng, -0.25, 0.25),
    })
    if (index % 5 === 0) youngLeaves.push(geometry)
    else leaves.push(geometry)
  }

  // 草穗：8 根，从丛心抽出，穗尖比叶丛高 10–20cm。
  const heads = []
  for (let index = 0; index < 8; index += 1) {
    const angle = rng() * Math.PI * 2
    const reach = 0.1 + rng() * 0.22
    const top = [
      Math.cos(angle) * reach,
      0.58 + rng() * 0.2,
      Math.sin(angle) * reach,
    ]
    heads.push(
      seedHead({
        base: [Math.cos(angle) * 0.02, 0, Math.sin(angle) * 0.02],
        top,
        radius: 0.008,
        seeds: 3,
        height: 0.07,
        seed: 600 + index,
      }),
    )
  }

  return {
    groups: fitGroups(
      [
        { name: 'garden-grass-clump-light', material: 1, geometry: merge(youngLeaves) },
        { name: 'garden-grass-clump-leaf', material: 3, geometry: merge(leaves) },
        { name: 'garden-grass-clump-accent', material: 5, geometry: merge(heads) },
      ],
      SIZE,
    ),
  }
}
