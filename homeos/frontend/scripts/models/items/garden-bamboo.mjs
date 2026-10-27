/**
 * 竹丛（1.05 × 2.7 × 0.85）
 *
 * 参照：早园竹 / 紫竹（庭院丛生竹）
 * - 16 根秆：秆径 2.6–4cm（顶部收细），3 个竹节，节处半径突变；
 * - 高度错落：0.62–1.0 倍总高，外侧秆矮、中心秆高，形成外扩的丛形；
 * - 上部 60% 才有叶：56 片披针形叶（含 12 片嫩叶），叶片下垂 50°–75°；
 * - 旧版是 12 根等径圆柱阵（上下同粗、无节、无叶），远看是一排管子。
 *
 * 槽位：0 base=老秆/枯秆(branch) / 1 light=嫩秆+嫩叶 / 2 dark=土面(soil) / 3 leaf=成叶。
 */
import { merge } from '../lib/primitive-kit.mjs'
import { add, between, blade, culm, fitGroups, random, sphere } from '../lib/garden-parts.mjs'

const SIZE = [1.05, 2.7, 0.85]

export const spec = {
  size: SIZE,
  mount: 'floor',
  topologyClass: 'solid',
}

export function build() {
  const rng = random(20261028)
  const oldCulms = []
  const youngCulms = []
  const leaves = []
  const youngLeaves = []
  const culmTips = []

  for (let index = 0; index < 16; index += 1) {
    // 基点：丛心密、外缘疏；外侧秆偏矮。
    const angle = rng() * Math.PI * 2
    const spread = Math.cbrt(rng()) * 0.34
    const base = [Math.cos(angle) * spread, 0, Math.sin(angle) * spread * 0.78]
    const outer = spread / 0.34
    const height = 2.7 * (0.95 - outer * 0.28 - rng() * 0.08)
    const taper = 1 + outer * 0.15
    const top = [base[0] * 1.55 + between(rng, -0.05, 0.05), height, base[2] * 1.55 + between(rng, -0.05, 0.05)]
    const geometry = culm({
      base,
      top,
      radius: (0.014 + rng() * 0.006) * taper,
      internodes: 3,
      segments: 6,
      seed: 400 + index,
    })
    // 4 根老秆（偏黄褐）混在丛里，其余是新秆。
    if (index % 4 === 0) oldCulms.push(geometry)
    else youngCulms.push(geometry)
    culmTips.push({ base, top, height })
  }

  // 叶：从秆的上半段抽出，方位随机，下垂 50°–75°。
  const leafCount = 64
  for (let index = 0; index < leafCount; index += 1) {
    const culmIndex = Math.floor(rng() * culmTips.length)
    const culm = culmTips[culmIndex]
    const t = 0.68 + rng() * 0.3
    const attach = add(culm.base, [
      (culm.top[0] - culm.base[0]) * t,
      (culm.top[1] - culm.base[1]) * t,
      (culm.top[2] - culm.base[2]) * t,
    ])
    const azimuth = rng() * Math.PI * 2
    const droop = 0.9 + rng() * 0.45
    const length = 0.22 + rng() * 0.12
    const geometry = blade({
      length,
      width: 0.032 + rng() * 0.01,
      curve: 0.35 + rng() * 0.3,
      segments: 2,
      thickness: 0.005,
      translate: attach,
      rotateX: droop,
      rotateY: azimuth,
      rotateZ: between(rng, -0.2, 0.2),
    })
    if (index % 6 === 0) youngLeaves.push(geometry)
    else leaves.push(geometry)
  }

  // 梢部叶云：单片叶在这个尺度只有几像素，梢部补 8 个小叶团交代「竹冠」的体积。
  for (let index = 0; index < 8; index += 1) {
    const culm = culmTips[Math.floor(rng() * culmTips.length)]
    leaves.push(
      sphere({
        radius: 0.11 + rng() * 0.05,
        segments: 7,
        rings: 4,
        center: [
          culm.top[0] + between(rng, -0.1, 0.1),
          culm.top[1] - 0.1 + between(rng, -0.12, 0.06),
          culm.top[2] + between(rng, -0.1, 0.1),
        ],
        squash: [1.1, 0.6, 1.1],
        rotateY: rng() * Math.PI,
      }),
    )
  }

  // 土面：丛心一小片落叶土（深色），让竹丛落地。
  const soil = sphere({
    radius: 0.28,
    segments: 10,
    rings: 4,
    center: [0, 0.01, 0],
    squash: [1.25, 0.16, 1.0],
  })

  return {
    groups: fitGroups(
      [
        { name: 'garden-bamboo-old', material: 0, geometry: merge(oldCulms) },
        { name: 'garden-bamboo-light', material: 1, geometry: merge([...youngCulms, ...youngLeaves]) },
        { name: 'garden-bamboo-soil', material: 2, geometry: soil },
        { name: 'garden-bamboo-leaf', material: 3, geometry: merge(leaves) },
      ],
      SIZE,
    ),
  }
}
