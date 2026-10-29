/**
 * 立柱「锚点 ≠ 占位盒中心」的契约测试（`studio-item-posture`）。
 *
 * 半圆柱 / 四分之一圆柱的锚点是**圆弧圆心**（`scripts/models/recenter-pillar-arc.mjs`，
 * 运行期 `preserveOrigin`），实体只朝 +x / +y 一侧长。平面图里形状仍按锚点落笔，所以
 * 选中框、角手柄、点选与缩放用的「占位矩形」必须整体偏出半个进深；偏了就是画面上
 * 「选中后半圆柱的框歪在一边 / 形状戳出框外」。
 *
 * 这里钉死三件事：
 *
 * 1. `itemPlanFootprintOffset` 的口径与资产一致：半圆柱 (0, 深/2)，四分之一 (宽/2, 深/2)，
 *    方柱 / 圆柱 / 内弧柱 / 躺姿立柱都为零；
 * 2. 平面符号（`tracePillarPlanPath`）实际落笔的范围，必须**正好**等于「锚点 + 偏移」后的
 *    占位矩形 —— 框和形状不允许差半个进深，旋转后也不许；
 * 3. 缩放往返不漂移：把占位矩形当输入再换回物件字段，锚点与尺寸必须回到原值。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const moduleUrl = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/items/studio-item-posture.ts',
    import.meta.url,
  ),
)
const {
  itemFromPlanFootprintResize,
  itemPlanFootprint,
  itemPlanFootprintCenter,
  itemPlanFootprintOffset,
  itemWithPlanFootprint,
  tracePillarPlanPath,
} = await import(moduleUrl)

const EPSILON = 1e-9

/** 把 `tracePillarPlanPath` 的落笔点全采下来（弧按 256 段采样），返回局部系范围。 */
function planPathExtents(shape, widthPx, depthPx) {
  const points = []
  const record = (x, y) => points.push({ x, y })
  const plan2dContext = {
    beginPath() {},
    closePath() {},
    moveTo: record,
    lineTo: record,
    rect(rectX, rectY, rectWidth, rectHeight) {
      record(rectX, rectY)
      record(rectX + rectWidth, rectY)
      record(rectX + rectWidth, rectY + rectHeight)
      record(rectX, rectY + rectHeight)
    },
    ellipse(centerX, centerY, radiusX, radiusY, _rotation, startAngle, endAngle) {
      const segments = 256
      for (let step = 0; step <= segments; step += 1) {
        const angle = startAngle + ((endAngle - startAngle) * step) / segments
        record(centerX + Math.cos(angle) * radiusX, centerY + Math.sin(angle) * radiusY)
      }
    },
  }
  tracePillarPlanPath(plan2dContext, shape, widthPx, depthPx)
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  }
}

function assertExtentsClose(actual, expected, label) {
  for (const key of ['minX', 'maxX', 'minY', 'maxY']) {
    assert.ok(
      Math.abs(actual[key] - expected[key]) <= 1e-6,
      `${label}: ${key} 期望 ${expected[key]}，实际 ${actual[key]}`,
    )
  }
}

function pillarItem(pillarShape, overrides = {}) {
  return {
    type: 'pillar',
    pillarShape,
    pillarAxis: 'vertical',
    x: 0,
    y: 0,
    rotation: 0,
    width: 0.45,
    // 半圆柱的真半圆截面：进深 = 半径 = 半宽（`reshape-pillar-semicircle.mjs`）。
    depth: pillarShape === 'semicircle' ? 0.225 : 0.45,
    height: 2.8,
    ...overrides,
  }
}

test('占位盒偏移：半圆柱只偏半个进深，四分之一圆柱两个方向各偏半个占位', () => {
  assert.deepEqual(itemPlanFootprintOffset(pillarItem('semicircle')), { x: 0, y: 0.1125 })
  assert.deepEqual(itemPlanFootprintOffset(pillarItem('quarter')), { x: 0.225, y: 0.225 })
  for (const centeredShape of ['square', 'round', 'quarterinner'])
    assert.deepEqual(itemPlanFootprintOffset(pillarItem(centeredShape)), { x: 0, y: 0 })
  // 躺姿立柱的平面占位是「宽 × 高」，锚点回到占位中心。
  assert.deepEqual(
    itemPlanFootprintOffset(pillarItem('semicircle', { pillarAxis: 'horizontal' })),
    { x: 0, y: 0 },
  )
  // 非立柱完全没有这份偏移。
  assert.deepEqual(itemPlanFootprintOffset({ type: 'sofa', width: 2, depth: 1 }), { x: 0, y: 0 })
})

test('平面符号的落笔范围 == 锚点 + 偏移 后的占位矩形（各造型）', () => {
  // 旋转是刚体变换，形状与框一起转，所以判据放在**局部系**里比：符号落笔范围必须正好
  // 覆盖「锚点为原点、中心偏出 offset」的那个矩形。旋转后的中心由
  // `itemPlanFootprintCenter` 负责（下一条用例）。
  const pixelsPerMeter = 200
  for (const pillarShape of ['square', 'round', 'semicircle', 'quarter', 'quarterinner']) {
    const item = pillarItem(pillarShape),
      footprint = itemPlanFootprint(item),
      widthPx = footprint.width * pixelsPerMeter,
      depthPx = footprint.depth * pixelsPerMeter,
      offset = itemPlanFootprintOffset(item),
      offsetPx = { x: offset.x * pixelsPerMeter, y: offset.y * pixelsPerMeter },
      drawnExtents = planPathExtents(pillarShape, widthPx, depthPx);
    assertExtentsClose(
      drawnExtents,
      {
        minX: offsetPx.x - widthPx / 2,
        maxX: offsetPx.x + widthPx / 2,
        minY: offsetPx.y - depthPx / 2,
        maxY: offsetPx.y + depthPx / 2,
      },
      pillarShape,
    )
  }
})

test('占位盒中心跟着摆放角度转，缩放往返不漂移', () => {
  // 平面 x / y 是**像素**，占位偏移是**米**：两者相加前必须乘 pixelsPerMeter。
  // 漏乘一次只会偏「1 像素 / 米」，框与形状就差半个进深（缩放时锚点也会被写成框中心）。
  const pixelsPerMeter = 200,
    quarter = pillarItem('quarter', { x: 600, y: -400, rotation: 90 }),
    center = itemPlanFootprintCenter(quarter, pixelsPerMeter)
  // 旋转 90°：(+宽/2, +深/2) 转到 (-深/2, +宽/2)，再乘 ppm 换成像素。
  assert.ok(Math.abs(center.x - (600 - 0.225 * pixelsPerMeter)) < EPSILON, `center.x=${center.x}`)
  assert.ok(Math.abs(center.y - (-400 + 0.225 * pixelsPerMeter)) < EPSILON, `center.y=${center.y}`)

  for (const pillarShape of ['square', 'round', 'semicircle', 'quarter', 'quarterinner'])
    for (const rotation of [0, 90, 213]) {
      const item = pillarItem(pillarShape, { x: 300, y: -100, rotation }),
        footprintRectangle = itemWithPlanFootprint(item, pixelsPerMeter),
        restored = itemFromPlanFootprintResize(item, footprintRectangle, pixelsPerMeter);
      assert.equal(restored.type, 'pillar')
      assert.ok(Math.abs(restored.x - item.x) < 1e-6, `${pillarShape} 锚点 x 漂移`)
      assert.ok(Math.abs(restored.y - item.y) < 1e-6, `${pillarShape} 锚点 y 漂移`)
      assert.ok(Math.abs(restored.width - item.width) < EPSILON, `${pillarShape} 宽漂移`)
      assert.ok(Math.abs(restored.depth - item.depth) < EPSILON, `${pillarShape} 深漂移`)
      // 占位矩形本身必须覆盖实际形状：半圆柱 / 四分之一圆柱的框中心不在锚点上。
      assert.equal(
        Math.hypot(
          footprintRectangle.x - item.x,
          footprintRectangle.y - item.y,
        ) > 0,
        ['semicircle', 'quarter'].includes(pillarShape),
        `${pillarShape} 占位矩形中心与锚点重合关系不对`,
      )
    }
})
