/**
 * 绿篱（1.6 × 1.0 × 0.55）
 *
 * 参照：黄杨 / 大叶黄杨修剪成的长方体绿篱
 * - 主体 1.6 × 0.94 × 0.55，顶面与两侧共 12 处叶簇起伏（3–5cm），
 *   不再是「一个盒子」；
 * - 底部 8cm 土带（深色），落地处不做悬空；
 * - 顶面起伏只在外缘，中心保持能站住水线的平面。
 *
 * 槽位：1 light=受光叶 / 2 dark=土带(soil) / 3 leaf=主叶。
 */
import { fitGroups, hedgeBody, scatterBlobs } from '../lib/garden-parts.mjs'
import { box } from '../lib/primitive-kit.mjs'

const SIZE = [1.6, 1.0, 0.55]

export const spec = {
  size: SIZE,
  mount: 'floor',
  topologyClass: 'solid',
}

export function build() {
  // 土带：8cm 高、比绿篱主体内收 3cm，侧视图里是一条深色落地带。
  const soil = box({ width: 1.5, height: 0.08, depth: 0.46, center: [0, 0.04, 0] })
  const body = hedgeBody({ width: 1.6, height: 0.94, depth: 0.55, bottom: 0.06, count: 14, seed: 131 })

  const youngLeaves = scatterBlobs({
    center: [0, 0.88, 0],
    radii: [0.6, 0.06, 0.2],
    count: 6,
    blobSize: 0.09,
    shape: 'box',
    seed: 132,
    segments: 9,
    rings: 5,
    inner: 0.85,
    flatten: 0.55,
  })

  return {
    groups: fitGroups(
      [
        { name: 'garden-hedge-light', material: 1, geometry: youngLeaves },
        { name: 'garden-hedge-soil', material: 2, geometry: soil },
        { name: 'garden-hedge-leaf', material: 3, geometry: body },
      ],
      SIZE,
    ),
  }
}
