/**
 * 厨房下柜 / 台面共享构件：`kitchensink`（水盆柜）与 `kitchencooktop`（燃气灶柜）共用。
 *
 * 2026-10-24 形态重建：两款原件是「三个叠起来的盒子」——柜体是一整块实心箱、正脸只有
 * 一块 1.15m 宽的假门板 + 一根 768mm 通长拉手，台面上的水盆 / 灶具都是**摆在台面上方**
 * 的薄片（水盆 = 两块叠起来的板，灶具 = 一块黑盒子 + 两层圆环）。
 * 这里把柜体拆成真实的板件结构（侧板 / 背板 / 底板 / 层板 / 两扇门 / 竖向拉手），
 * 台面按「灶台 / 水槽开孔」分四条边带生成，让台上的器具能真正落进开孔里。
 */
import { box, cylinder, merge, transform } from './primitive-kit.mjs'

/** 柜体深度（不含门板与拉手外凸）；台面深 0.648，前缘留出 35mm 出挑。 */
export const BODY_DEPTH = 0.578
export const PLINTH_HEIGHT = 0.085

/**
 * 下柜：踢脚 + 侧板/背板/底板 + 前/后顶撑（或整块顶板）+ 层板 + 两扇门 + 两根竖向拉手。
 *
 * `openTop`：水盆柜 / 燃气灶柜必须为 `true`。这两种柜的台面上要开孔，柜顶若是整块顶板，
 * 板面正好横在盆胆 / 灶体中间 —— 从上往下看只看到一块板，「盆」就成了贴片（2026-10-24
 * 的用户反馈「台下盆深度不足」实测根因就是这个顶板）。改成前后两根 50mm 宽的顶撑：
 * 台面照旧有支撑，开孔里能直接看到盆胆与灶体。
 *
 * `shelf`：水盆柜给 `false` —— 真实水槽柜的下半是给排水 / 存水弯，没有层板。
 *
 * @param {{width?:number, carcassTop?:number, bodyDepth?:number, panel?:number,
 *   doorBottom?:number, doorGap?:number, openTop?:boolean, shelf?:boolean}} options
 * @returns {{plinth:object, carcass:object, doors:object, handles:object}}
 */
export function baseCabinet({
  width = 1.2,
  carcassTop = 0.83,
  bodyDepth = BODY_DEPTH,
  panel = 0.018,
  doorBottom = 0.09,
  doorGap = 0.003,
  openTop = false,
  shelf: withShelf = true,
} = {}) {
  const bodyFront = bodyDepth / 2
  const innerWidth = width - panel * 2
  const bodyHeight = carcassTop - PLINTH_HEIGHT

  // 踢脚：比柜体缩进 60mm（正面）/ 24mm（两侧），让柜体看起来是「悬浮」的。
  const plinth = box({
    width: width - 0.048,
    height: PLINTH_HEIGHT,
    depth: 0.48,
    center: [0, PLINTH_HEIGHT / 2, bodyFront - 0.06 - 0.24],
  })

  const sides = merge(
    [-1, 1].map((side) =>
      box({
        width: panel,
        height: bodyHeight,
        depth: bodyDepth,
        center: [side * (width / 2 - panel / 2), PLINTH_HEIGHT + bodyHeight / 2, 0],
      }),
    ),
  )
  const back = box({
    width: innerWidth + 0.004,
    height: bodyHeight - 0.002,
    depth: 0.01,
    center: [0, PLINTH_HEIGHT + bodyHeight / 2, -bodyDepth / 2 + 0.0055],
  })
  const bottom = box({
    width: innerWidth + 0.004,
    height: panel,
    depth: bodyDepth - 0.002,
    center: [0, PLINTH_HEIGHT + panel / 2 + 0.001, 0],
  })
  const railY = carcassTop - panel / 2 - 0.001
  const railDepth = 0.05
  const topRail = openTop
    ? // 开顶柜：只留前后两根顶撑，开孔里能直接看到盆胆 / 灶体。顶撑避开盆胆外沿
      // （盆胆外沿 z = ±0.22、灶体 z = ±0.145），不会和台上的器具打架。
      merge(
        [-1, 1].map((side) =>
          box({
            width: innerWidth + 0.004,
            height: panel,
            depth: railDepth,
            center: [0, railY, side * (bodyDepth / 2 - railDepth / 2 - 0.004)],
          }),
        ),
      )
    : box({
        width: innerWidth + 0.004,
        height: panel,
        depth: bodyDepth - 0.002,
        center: [0, railY, 0],
      })
  // 层板：缩进前脸 12mm，避开柜门内侧。
  const shelf = withShelf
    ? box({
        width: innerWidth + 0.004,
        height: panel,
        depth: bodyDepth - 0.014,
        center: [0, 0.45, -0.006],
      })
    : null

  const doorHeight = carcassTop - doorBottom - doorGap
  const doorWidth = (width - doorGap * 3) / 2
  const doorZ = bodyFront + panel / 2
  const doors = merge(
    [-1, 1].map((side) =>
      box({
        width: doorWidth,
        height: doorHeight,
        depth: panel,
        center: [
          side * (doorGap / 2 + doorWidth / 2),
          doorBottom + doorHeight / 2,
          doorZ,
        ],
      }),
    ),
  )

  // 竖向长拉手：立在门缝内侧，外凸 16mm 正好与台面前缘齐平（bodyFront + 34mm）。
  const handles = merge(
    [-1, 1].map((side) =>
      box({
        width: 0.016,
        height: 0.24,
        depth: 0.016,
        center: [side * 0.045, 0.55, bodyFront + panel + 0.008],
      }),
    ),
  )

  return {
    plinth,
    carcass: merge([sides, back, bottom, topRail, ...(shelf ? [shelf] : [])]),
    doors,
    handles,
  }
}

/**
 * 台面：绕一个矩形开孔生成四条边带（前 / 后 / 左 / 右）。
 *
 * 用四条边带而不是「整块板 + 布尔挖孔」，是因为精修件的几何校验要求逐壳闭合、
 * 无边界边；四条闭合边带既能保证拓扑干净，又不依赖布尔运算。
 *
 * @param {{width:number, depth:number, topY:number, thickness?:number,
 *   openingWidth:number, openingDepth:number, openingCenterZ?:number}} options
 */
export function counterWithOpening({
  width,
  depth,
  topY,
  thickness = 0.02,
  openingWidth,
  openingDepth,
  openingCenterZ = 0,
}) {
  const centerY = topY - thickness / 2
  const openingFront = openingCenterZ + openingDepth / 2
  const openingBack = openingCenterZ - openingDepth / 2
  const frontDepth = depth / 2 - openingFront
  const backDepth = openingBack + depth / 2
  const sideWidth = width / 2 - openingWidth / 2

  const front = box({
    width,
    height: thickness,
    depth: frontDepth,
    center: [0, centerY, openingFront + frontDepth / 2],
  })
  const back = box({
    width,
    height: thickness,
    depth: backDepth,
    center: [0, centerY, openingBack - backDepth / 2],
  })
  // 侧边带在前后方向各多压 1mm 进前后边带：避免两端顶面/侧面在拐角处共边，
  // 焊接后会出现非流形边。多出的 1mm 与前/后边带同材质、同高度，肉眼无差。
  const sides = merge(
    [-1, 1].map((side) =>
      box({
        width: sideWidth,
        height: thickness,
        depth: openingDepth + 0.002,
        center: [side * (openingWidth / 2 + sideWidth / 2), centerY, openingCenterZ],
      }),
    ),
  )
  return { geometry: merge([front, back, sides]), front, back, sides }
}

/**
 * 台下盆盆胆：一个**闭合单壳**的矩形盆（外壁 + 外底 + 内底 + 内壁 + 藏在台面下的盆沿）。
 *
 * 为什么不用「四块斜板 + 一块底板」拼：斜板之间的贴合边一旦落到相邻板的表面上，焊接后
 * 就是非流形边（>2 面共边）。这里按「杯子的剖面」一次成形，每条边恰好两个面：
 *
 * ```
 *        台面底下      B(内沿) ← 盆沿 → A(外沿)
 *                 内壁 ╱              ╲ 外壁
 *                    D(内底)          C(外底)
 * ```
 *
 * 尺寸口径（`rimInner` 比台面开孔大 1–2mm、`rimOuter` 再向外 18–20mm）：
 * 站在台面上往下看，只能看到开孔与**盆壁**，看不到任何盆沿 —— 这才是台下盆。
 * 盆壁向内收（`bottomOuter` < `rimOuter`）给出真实的拔模斜度，俯视时一眼能看到深度。
 *
 * @param {{rimOuter:number[], rimInner:number[], bottomOuter:number[], bottomInner:number[],
 *   rimY:number, innerFloorY:number, outerFloorY:number, uvScale?:number}} options
 *   四个 `[宽, 深]` 依次是盆沿外/内、盆底外/内。
 */
export function rectBowlShell({
  rimOuter,
  rimInner,
  bottomOuter,
  bottomInner,
  rimY,
  innerFloorY,
  outerFloorY,
  uvScale = 1,
}) {
  const positions = []
  const normals = []
  const uvs = []
  const indices = []

  const loop = ([w, d], y) => [
    [-w / 2, y, -d / 2],
    [w / 2, y, -d / 2],
    [w / 2, y, d / 2],
    [-w / 2, y, d / 2],
  ]

  /** 四边形（四个角逆时针给），法线按面法线算，UV 用 xz / 斜边长度投影。 */
  const quad = (a, b, c, d) => {
    const base = positions.length / 3
    const points = [a, b, c, d]
    const ux = b[0] - a[0]
    const uy = b[1] - a[1]
    const uz = b[2] - a[2]
    const vx = d[0] - a[0]
    const vy = d[1] - a[1]
    const vz = d[2] - a[2]
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const length = Math.hypot(nx, ny, nz) || 1
    nx /= length
    ny /= length
    nz /= length
    for (const point of points) {
      positions.push(point[0], point[1], point[2])
      normals.push(nx, ny, nz)
      uvs.push((point[0] + point[2]) * uvScale, (point[1] + point[2]) * uvScale)
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  const rimOuterLoop = loop(rimOuter, rimY)
  const rimInnerLoop = loop(rimInner, rimY)
  const bottomOuterLoop = loop(bottomOuter, outerFloorY)
  const bottomInnerLoop = loop(bottomInner, innerFloorY)

  for (let side = 0; side < 4; side += 1) {
    const next = (side + 1) % 4
    // 盆沿：外沿 → 内沿，朝上（藏在台面底面之下）。
    quad(
      rimInnerLoop[side],
      rimInnerLoop[next],
      rimOuterLoop[next],
      rimOuterLoop[side],
    )
    // 外壁：上外沿 → 下外底，朝外。
    quad(
      rimOuterLoop[side],
      rimOuterLoop[next],
      bottomOuterLoop[next],
      bottomOuterLoop[side],
    )
    // 内壁：下内底 → 上内沿，朝盆腔内侧。
    quad(
      bottomInnerLoop[side],
      bottomInnerLoop[next],
      rimInnerLoop[next],
      rimInnerLoop[side],
    )
  }
  // 外底朝下、内底朝上，形成盆底钢板厚度。
  quad(
    bottomOuterLoop[3],
    bottomOuterLoop[2],
    bottomOuterLoop[1],
    bottomOuterLoop[0],
  )
  quad(
    bottomInnerLoop[0],
    bottomInnerLoop[1],
    bottomInnerLoop[2],
    bottomInnerLoop[3],
  )

  return { positions, normals, uvs, indices }
}

/**
 * 水龙头「鹅颈」弯管：从 `(baseY, baseZ)` 竖直向上起弯，翻过 180° 落回同一高度、
 * 朝前伸出 `2 × radius`。逐段小圆柱沿圆弧拼接，段与段之间少量重叠，避免露出缝。
 *
 * @param {{baseY:number, baseZ:number, radius:number, tubeRadius:number, segments?:number}} options
 */
export function gooseneckArc({ baseY, baseZ, radius, tubeRadius, segments = 10 }) {
  const parts = []
  const step = Math.PI / segments
  for (let index = 0; index < segments; index += 1) {
    const angle = (index + 0.5) * step
    const y = baseY + Math.sin(angle) * radius
    const z = baseZ + radius - Math.cos(angle) * radius
    // 弦长 = 2R·sin(step/2)；放大 8% 让相邻段互相咬合。
    const height = 2 * radius * Math.sin(step / 2) * 1.08
    parts.push(
      transform(cylinder({ radiusTop: tubeRadius, height, segments: 14 }), {
        rotateX: angle,
        translate: [0, y, z],
      }),
    )
  }
  return merge(parts)
}
