/**
 * 低矮草（0.8 × 0.42 × 0.8）
 *
 * 参照：沿阶草 / 苔草 / 低矮麦冬（地被）
 * - 66 片短叶（0.18–0.4m）沿地面放射，倾角 35°–65°，向外铺开成盘状；
 * - 叶片宽 1.8–2.4cm、叶尖收细，中间一撮略高（0.35–0.4m）；
 * - 中心 4cm 高的土丘（深色），落地不是悬空的草皮。
 *
 * 槽位：1 light=嫩叶 / 2 dark=土丘(soil) / 3 leaf=主叶。
 */
import { merge } from '../lib/primitive-kit.mjs'
import { between, blade, fitGroups, random, sphere } from '../lib/garden-parts.mjs'

const SIZE = [0.8, 0.42, 0.8]

export const spec = {
  size: SIZE,
  mount: 'floor',
  topologyClass: 'open-sheet',
}

export function build() {
  const rng = random(20261031)
  const leaves = []
  const youngLeaves = []

  for (let index = 0; index < 66; index += 1) {
    const angle = rng() * Math.PI * 2
    // 外层叶更长更平，内层叶更短更立。
    const outer = rng()
    const rootRadius = 0.02 + outer * 0.06
    const length = 0.18 + outer * 0.22 + rng() * 0.05
    const geometry = blade({
      length,
      width: 0.018 + rng() * 0.006,
      curve: 0.3 + rng() * 0.35,
      segments: 2,
      thickness: 0.004,
      translate: [Math.cos(angle) * rootRadius, 0, Math.sin(angle) * rootRadius],
      rotateX: 0.55 + outer * 0.5 + rng() * 0.15,
      rotateY: angle,
      rotateZ: between(rng, -0.3, 0.3),
    })
    if (index % 5 === 0) youngLeaves.push(geometry)
    else leaves.push(geometry)
  }

  const soil = sphere({
    radius: 0.16,
    segments: 10,
    rings: 4,
    center: [0, 0.005, 0],
    squash: [1.2, 0.25, 1.1],
  })

  return {
    groups: fitGroups(
      [
        { name: 'garden-grass-low-light', material: 1, geometry: merge(youngLeaves) },
        { name: 'garden-grass-low-soil', material: 2, geometry: soil },
        { name: 'garden-grass-low-leaf', material: 3, geometry: merge(leaves) },
      ],
      SIZE,
    ),
  }
}
