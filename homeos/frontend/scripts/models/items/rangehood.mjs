/**
 * `rangehood`（900 × 550 × 450 mm 壁挂油烟机）参数化重建。
 *
 * 槽位：0 外壳（烟道 + 集烟腔）/ 1 饰条（下沿包边）/ 2 滤网 / 3 照明灯带。
 * 壁挂件保留挂载语义：建模时以底面 y=0 为安装基准，`mount: 'wall'` 交给加载器抬升。
 */
import { merge } from '../lib/primitive-kit.mjs'
import { b } from '../lib/parts.mjs'

export const spec = { size: [0.9, 0.55, 0.45], mount: 'wall', topologyClass: 'solid' }

const W = 0.9
const H = 0.55
const D = 0.45
const CANOPY_H = 0.16
const CHIMNEY_W = 0.32
const CHIMNEY_D = 0.3
/** 烟道贴着墙：后表面 -D/2，集烟腔前伸到 +D/2。 */
const BACK = -D / 2

const chimney = merge([
  b(CHIMNEY_W, H - CANOPY_H, CHIMNEY_D, 0, (H + CANOPY_H) / 2, BACK + CHIMNEY_D / 2),
  b(CHIMNEY_W - 0.02, 0.03, CHIMNEY_D - 0.02, 0, H - 0.015, BACK + CHIMNEY_D / 2),
])
const canopy = merge([
  b(W, CANOPY_H, D, 0, CANOPY_H / 2, 0),
  b(W - 0.04, 0.05, D - 0.04, 0, CANOPY_H + 0.025, -0.01),
])
const trim = merge([
  b(W, 0.02, D, 0, 0.01, 0),
  b(W, 0.04, 0.02, 0, CANOPY_H - 0.02, D / 2 - 0.01),
])
const filters = merge([
  b(W / 2 - 0.04, 0.008, D - 0.1, -W / 4, 0.026, 0.02),
  b(W / 2 - 0.04, 0.008, D - 0.1, W / 4, 0.026, 0.02),
])
const lamps = merge([
  b(0.12, 0.008, 0.05, -W / 4, 0.032, D / 2 - 0.05),
  b(0.12, 0.008, 0.05, W / 4, 0.032, D / 2 - 0.05),
])

export function build() {
  return {
    groups: [
      { name: 'rangehood-shell', material: 0, geometry: merge([chimney, canopy]) },
      { name: 'rangehood-trim', material: 1, geometry: trim },
      { name: 'rangehood-grille', material: 2, geometry: filters },
      { name: 'rangehood-light', material: 3, geometry: lamps },
    ],
  }
}
