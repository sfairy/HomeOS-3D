/**
 * 柱形乔木（0.72 × 3.2 × 0.72）
 *
 * 参照：塔杨 / 意大利柏 / 柱形欧洲鹅耳枥
 * - 冠幅 : 高度 ≈ 1 : 4.4（0.72m 冠幅对应 3.2m 高），原来 1.0m 的冠幅是「胖柱子」；
 * - 冠层从 0.45m 起、到 3.2m 收尖，纵向 9 层扁椭球堆叠，层间错位 ±3cm；
 * - 树干只在基部露出一小段，之后被冠层包住。
 *
 * 槽位：0 base=树干(trunk) / 1 light=受光叶 / 2 dark=分枝(branch) / 3 leaf=主叶。
 */
import { merge } from '../lib/primitive-kit.mjs'
import { fitGroups, random, scatterBlobs, sphere, tubeChain } from '../lib/garden-parts.mjs'

const SIZE = [0.72, 3.2, 0.72]

export const spec = {
  size: SIZE,
  mount: 'floor',
  topologyClass: 'open-sheet',
}

export function build() {
  const rng = random(20261025)

  const trunk = tubeChain({
    points: [
      [0, 0, 0],
      [0.005, 0.6, 0],
      [0.01, 1.6, 0],
      [0, 3.05, 0],
    ],
    radii: [0.045, 0.032, 0.024, 0.012],
    segments: 8,
  })

  // 纵向 9 层：半径先增后减，层间错位，顶端收尖 —— 这是柱形树冠的识别点。
  const tiers = [
    { y: 0.5, radius: 0.2 },
    { y: 0.82, radius: 0.26 },
    { y: 1.14, radius: 0.3 },
    { y: 1.46, radius: 0.32 },
    { y: 1.78, radius: 0.32 },
    { y: 2.1, radius: 0.3 },
    { y: 2.42, radius: 0.27 },
    { y: 2.72, radius: 0.22 },
    { y: 2.98, radius: 0.14 },
    { y: 3.14, radius: 0.06 },
  ]
  const leaves = merge(
    tiers.flatMap((tier, index) => {
      const swayX = Math.sin(index * 1.7) * 0.028
      const swayZ = Math.cos(index * 2.3) * 0.026
      const main = sphere({
        radius: tier.radius,
        segments: 12,
        rings: 7,
        center: [swayX, tier.y, swayZ],
        squash: [1.05, 0.52, 1.0],
        rotateY: rng() * Math.PI,
      })
      // 每层补一枚偏移小叶团：柱形树冠的轮廓是「起毛的柱面」，不是一串光滑鸡蛋。
      const side = index % 2 === 0 ? 1 : -1
      const lobe = sphere({
        radius: tier.radius * 0.55,
        segments: 8,
        rings: 5,
        center: [
          swayX + side * tier.radius * 0.62,
          tier.y + (rng() - 0.5) * 0.06,
          swayZ + (rng() - 0.5) * tier.radius * 0.9,
        ],
        squash: [1.0, 0.62, 1.0],
        rotateY: rng() * Math.PI,
      })
      return [main, lobe]
    }),
  )

  // 分枝：藏在冠内，只在层间露一点枝影。
  const branches = merge(
    [0.9, 1.5, 2.05, 2.5].map((y, index) =>
      tubeChain({
        points: [
          [0, y, 0],
          [Math.cos(index * 1.9) * 0.16, y + 0.16, Math.sin(index * 1.9) * 0.16],
        ],
        radii: [0.014, 0.005],
        segments: 4,
      }),
    ),
  )

  // 受光叶：冠层外侧偏上一个窄带（柱形树的受光面是竖条，不是圆顶）。
  const youngLeaves = scatterBlobs({
    center: [0.03, 2.3, 0.02],
    radii: [0.26, 0.62, 0.24],
    count: 6,
    blobSize: 0.14,
    seed: 31,
    segments: 7,
    rings: 4,
    inner: 0.86,
    flatten: 0.7,
  })

  return {
    groups: fitGroups(
      [
        { name: 'garden-tree-columnar-trunk', material: 0, geometry: trunk },
        { name: 'garden-tree-columnar-light', material: 1, geometry: youngLeaves },
        { name: 'garden-tree-columnar-branch', material: 2, geometry: branches },
        { name: 'garden-tree-columnar-leaf', material: 3, geometry: leaves },
      ],
      SIZE,
    ),
  }
}
