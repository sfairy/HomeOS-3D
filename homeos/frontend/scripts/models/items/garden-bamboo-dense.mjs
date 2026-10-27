/**
 * 浓密竹丛（1.2 × 2.4 × 1.0）
 *
 * 参照：密植的早园竹 / 凤尾竹（比「竹丛」更矮更密）
 * - 20 根秆，秆间距 8–18cm，高度 0.55–1.0 倍总高（2.4m）；
 * - 叶片更密（72 片），集中在 1.0m 以上，形成上密下疏的竹冠；
 * - 秆径 2.2–3.6cm，3 个竹节。
 *
 * 槽位：0 base=老秆(branch) / 1 light=嫩秆+嫩叶 / 2 dark=土面(soil) / 3 leaf=成叶。
 */
import { merge } from '../lib/primitive-kit.mjs'
import { add, between, blade, culm, fitGroups, random, sphere } from '../lib/garden-parts.mjs'

const SIZE = [1.2, 2.4, 1.0]

export const spec = {
  size: SIZE,
  mount: 'floor',
  topologyClass: 'solid',
}

export function build() {
  const rng = random(20261029)
  const oldCulms = []
  const youngCulms = []
  const leaves = []
  const youngLeaves = []
  const culmTips = []

  for (let index = 0; index < 20; index += 1) {
    const angle = rng() * Math.PI * 2
    const spread = Math.cbrt(rng()) * 0.42
    const base = [Math.cos(angle) * spread, 0, Math.sin(angle) * spread * 0.8]
    const outer = spread / 0.42
    const height = 2.4 * (0.9 - outer * 0.3 - rng() * 0.1)
    const top = [base[0] * 1.35 + between(rng, -0.06, 0.06), height, base[2] * 1.35 + between(rng, -0.06, 0.06)]
    const geometry = culm({
      base,
      top,
      radius: (0.012 + rng() * 0.006) * (1 + outer * 0.12),
      internodes: 3,
      segments: 6,
      seed: 500 + index,
    })
    if (index % 5 === 0) oldCulms.push(geometry)
    else youngCulms.push(geometry)
    culmTips.push({ base, top, height })
  }

  for (let index = 0; index < 84; index += 1) {
    const culm = culmTips[Math.floor(rng() * culmTips.length)]
    const t = 0.62 + rng() * 0.36
    const attach = add(culm.base, [
      (culm.top[0] - culm.base[0]) * t,
      (culm.top[1] - culm.base[1]) * t,
      (culm.top[2] - culm.base[2]) * t,
    ])
    const geometry = blade({
      length: 0.19 + rng() * 0.11,
      width: 0.03 + rng() * 0.01,
      curve: 0.4 + rng() * 0.3,
      segments: 2,
      thickness: 0.005,
      translate: attach,
      rotateX: 0.85 + rng() * 0.5,
      rotateY: rng() * Math.PI * 2,
      rotateZ: between(rng, -0.22, 0.22),
    })
    if (index % 7 === 0) youngLeaves.push(geometry)
    else leaves.push(geometry)
  }

  // 梢部叶云：密植竹丛的冠层体积靠这些小团交代。
  for (let index = 0; index < 10; index += 1) {
    const culm = culmTips[Math.floor(rng() * culmTips.length)]
    leaves.push(
      sphere({
        radius: 0.1 + rng() * 0.045,
        segments: 7,
        rings: 4,
        center: [
          culm.top[0] + between(rng, -0.1, 0.1),
          culm.top[1] - 0.08 + between(rng, -0.12, 0.05),
          culm.top[2] + between(rng, -0.1, 0.1),
        ],
        squash: [1.1, 0.6, 1.1],
        rotateY: rng() * Math.PI,
      }),
    )
  }

  const soil = sphere({
    radius: 0.32,
    segments: 10,
    rings: 4,
    center: [0, 0.01, 0],
    squash: [1.25, 0.14, 1.0],
  })

  return {
    groups: fitGroups(
      [
        { name: 'garden-bamboo-dense-old', material: 0, geometry: merge(oldCulms) },
        { name: 'garden-bamboo-dense-light', material: 1, geometry: merge([...youngCulms, ...youngLeaves]) },
        { name: 'garden-bamboo-dense-soil', material: 2, geometry: soil },
        { name: 'garden-bamboo-dense-leaf', material: 3, geometry: merge(leaves) },
      ],
      SIZE,
    ),
  }
}
