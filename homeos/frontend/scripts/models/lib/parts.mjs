/**
 * 精修件配方共用的构件小工具。
 *
 * 所有配方都按「绝对坐标 + 米」建模，`rebuild-items.mjs` 只负责把包围盒居中、底面落到
 * y=0，并校验与 specs 的尺寸偏差 ≤2%。这里只放**反复出现**的构件，避免每个配方
 * 都重写四腿 / 踢脚 / 接触阴影 / 抽屉面板的坐标推导。
 */
import { box, cylinder, merge, transform } from './primitive-kit.mjs'

/** 盒子：`b(宽, 高, 深, 中心x, 中心y, 中心z)`。 */
export const b = (width, height, depth, x = 0, y = 0, z = 0) =>
  box({ width, height, depth, center: [x, y, z] })

/** 四条方腿：`inset` 是腿外表面到构件外沿的距离。 */
export function legs4({ height, insetX, insetZ, size = 0.05, y = 0 }) {
  const leg = box({ width: size, height, depth: size })
  return merge(
    [
      [insetX, insetZ],
      [insetX, -insetZ],
      [-insetX, insetZ],
      [-insetX, -insetZ],
    ].map(([x, z]) =>
      transform(leg, { translate: [x, y + height / 2, z] }),
    ),
  )
}

/** 四条圆腿（软包家具、圆桌）。 */
export function roundLegs4({ radius, height, size = 0.04, y = 0, segments = 12 }) {
  const leg = cylinder({ radiusTop: size / 2, height, segments })
  return merge(
    [0, 1, 2, 3].map((index) => {
      const angle = Math.PI / 4 + (index / 4) * Math.PI * 2
      return transform(leg, {
        translate: [Math.cos(angle) * radius, y + height / 2, Math.sin(angle) * radius],
      })
    }),
  )
}

/**
 * 接触阴影：贴地 4mm 的闭合薄板，不参与闭合性验收，但保持 solid 拓扑干净。
 * 比地面略小一点，避免和踢脚线共面打架。
 */
export function contactShadow(width, depth, thickness = 0.004) {
  return b(width - 0.02, thickness, depth - 0.02, 0, thickness / 2, 0)
}

/** 柜体：左右侧板 + 顶底板 + 背板，返回 { carcass, interior } 两个块。 */
export function carcassBox({
  width,
  height,
  depth,
  center = [0, 0, 0],
  panel = 0.018,
  back = 0.008,
}) {
  const [cx, cy, cz] = center
  const side = box({ width: panel, height, depth })
  const topBottom = box({ width: width - panel * 2, height: panel, depth })
  const backPanel = box({ width: width - panel * 2, height: height - panel * 2, depth: back })
  return merge([
    transform(side, { translate: [cx - width / 2 + panel / 2, cy, cz] }),
    transform(side, { translate: [cx + width / 2 - panel / 2, cy, cz] }),
    transform(topBottom, { translate: [cx, cy + height / 2 - panel / 2, cz] }),
    transform(topBottom, { translate: [cx, cy - height / 2 + panel / 2, cz] }),
    transform(backPanel, { translate: [cx, cy, cz - depth / 2 + back / 2] }),
  ])
}

/** 一根横向金属拉手（圆管 + 两个支脚）。 */
export function pullBar({ length, radius = 0.009, standoff = 0.03, center = [0, 0, 0] }) {
  const bar = cylinder({ radiusTop: radius, height: length, segments: 10 })
  const rotated = transform(bar, { rotateZ: Math.PI / 2 })
  const post = cylinder({ radiusTop: radius * 0.8, height: standoff, segments: 8 })
  return merge([
    transform(rotated, { translate: [center[0], center[1], center[2]] }),
    transform(post, { translate: [center[0] - length / 2 + radius * 2, center[1], center[2] - standoff / 2] }),
    transform(post, { translate: [center[0] + length / 2 - radius * 2, center[1], center[2] - standoff / 2] }),
  ])
}

/**
 * 非均匀缩放几何（只改 positions，不动 normals —— 用于树冠这类整体轮廓的 squash）。
 * 叶片已经登记 `open-sheet`，法线误差肉眼不可见，换来的轮廓准确度更值。
 */
export function axisScale(geometry, [sx, sy, sz]) {
  const positions = geometry.positions.map((value, index) =>
    value * (index % 3 === 0 ? sx : index % 3 === 1 ? sy : sz),
  )
  return { ...geometry, positions }
}
