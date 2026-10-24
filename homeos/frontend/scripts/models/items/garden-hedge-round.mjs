/**
 * 圆顶绿篱（1.8 × 0.85 × 0.65）
 *
 * 参照：修剪成圆顶的长条绿篱 / 迷迭香矮篱
 * - 长向 1.8m 的连续圆顶（不是圆柱端头），端面收圆、顶面没有平段；
 * - 主体 = 一枚长椭球核 + 12 个外缘叶簇，叶片起伏沿长向均匀；
 * - 底部 7cm 土带，落地干净。
 *
 * 槽位：1 light=受光叶 / 2 dark=土带(soil) / 3 leaf=主叶。
 */
import { merge } from '../lib/primitive-kit.mjs'
import { fitGroups, scatterBlobs, sphere } from '../lib/garden-parts.mjs'
import { box } from '../lib/primitive-kit.mjs'

const SIZE = [1.8, 0.85, 0.65]

export const spec = {
  size: SIZE,
  mount: 'floor',
  topologyClass: 'open-sheet',
}

export function build() {
  const soil = box({ width: 1.7, height: 0.07, depth: 0.54, center: [0, 0.035, 0] })

  // 椭球核：长半轴 0.86、高半轴 0.5、厚半轴 0.3，两端自带圆角。
  const core = sphere({
    radius: 0.5,
    segments: 12,
    rings: 7,
    center: [0, 0.42, 0],
    squash: [1.72, 1.0, 0.6],
  })

  // 外缘叶簇：沿长向铺开，顶面与侧面都有起伏。
  const ridges = scatterBlobs({
    center: [0, 0.45, 0],
    radii: [0.8, 0.34, 0.24],
    count: 16,
    blobSize: 0.14,
    shape: 'dome',
    seed: 141,
    segments: 9,
    rings: 5,
    inner: 0.62,
    flatten: 0.82,
    jitter: 0.35,
  })

  const youngLeaves = scatterBlobs({
    center: [0, 0.62, 0],
    radii: [0.7, 0.2, 0.18],
    count: 6,
    blobSize: 0.08,
    shape: 'dome',
    seed: 142,
    segments: 8,
    rings: 5,
    inner: 0.85,
    flatten: 0.6,
  })

  return {
    groups: fitGroups(
      [
        { name: 'garden-hedge-round-light', material: 1, geometry: youngLeaves },
        { name: 'garden-hedge-round-soil', material: 2, geometry: soil },
        { name: 'garden-hedge-round-leaf', material: 3, geometry: merge([core, ridges]) },
      ],
      SIZE,
    ),
  }
}
