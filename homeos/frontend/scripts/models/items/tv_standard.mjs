/**
 * `tv_standard`（65 英寸电视，含底座）参数化重建。
 *
 * 规格来源：三星 AU7700 65" 规格页 —— 含底座 1449.4 × 906.6 × 282.1 mm
 * （`model-specs.json` 里 confidence 0.9 的那条）。
 *
 * 原模型只有一块 1.5 × 0.57 × 0.05 的裸屏：高度差 37%、深度差 82%（缺底座与立柱）。
 * 重建后：屏幕面板 + 一体边框 + 底座 + 立柱，整体 1449.4 × 906.6 × 282.1 mm，
 * 前面朝 +Z（与其他家具一致），底面 y=0。
 *
 * 构件与槽位：源文件只有一个槽位 `tv_standard-material-0`，重建沿用该槽位（单槽模型
 * 允许整件同材质），避免触发 `material-<n>` 下标分支的迁移。
 */
import { box, merge } from '../lib/primitive-kit.mjs'

export const spec = {
  size: [1.4494, 0.9066, 0.2821],
  mount: 'tabletop',
  topologyClass: 'solid',
}

/** 65" 面板可视区：16:9 → 1.435 宽时高 0.807。 */
const PANEL = { width: 1.435, height: 0.807, thickness: 0.03 }
const BEZEL = 0.008
// 深度 0.2821 由底座给足：官方规格的「含底座深度」就是底座前后缘。
const STAND = { width: 0.78, depth: 0.2821, thickness: 0.022, neckWidth: 0.09, neckDepth: 0.06 }
const TOTAL_HEIGHT = 0.9066

export function build() {
  const standTop = STAND.thickness
  // 面板顶面正好落在规格总高处，剩下的高度全给立柱。
  const panelBottom = TOTAL_HEIGHT - (PANEL.height + BEZEL * 2)
  const panelCenterY = panelBottom + PANEL.height / 2 + BEZEL
  // 面板：正面在 +Z，屏幕玻璃比边框再凸 0.5mm。
  const body = box({
    width: PANEL.width + BEZEL * 2,
    height: PANEL.height + BEZEL * 2,
    depth: PANEL.thickness,
    center: [0, panelCenterY, 0],
  })
  const glass = box({
    width: PANEL.width,
    height: PANEL.height,
    depth: 0.004,
    center: [0, panelCenterY, PANEL.thickness / 2 + 0.0005],
  })
  const stand = box({
    width: STAND.width,
    height: STAND.thickness,
    depth: STAND.depth,
    center: [0, standTop / 2, 0],
  })
  const neck = box({
    width: STAND.neckWidth,
    height: panelBottom - standTop,
    depth: STAND.neckDepth,
    center: [0, (panelBottom + standTop) / 2, -STAND.depth * 0.18],
  })
  return {
    groups: [{ name: 'tv_standard-body', material: 0, geometry: merge([body, glass, neck, stand]) }],
  }
}
