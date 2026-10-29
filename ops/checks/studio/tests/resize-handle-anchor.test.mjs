/**
 * 鼠标拖角缩放（`resize-item`）的契约测试。
 *
 * 手柄、选中框、点选与缩放共用同一套「占位矩形」：`itemWithPlanFootprint` 把 x / y 挪到
 * 占位盒中心（半圆柱 / 四分之一圆柱的锚点在圆弧圆心，框整体偏出半个占位），
 * `resizeRotatedItemFromCorner` 在占位框里按对角锚点算新宽深，`itemFromPlanFootprintResize`
 * 再把框中心换回摆放锚点。
 *
 * 这里钉死缩放必须满足的两条用户可见口径：
 *
 * 1. 对角（`anchor`）在缩放过程中**不动** —— 拖谁，谁对面就钉住；
 * 2. 被拖的角**跟着指针走** —— 松手时手柄就在鼠标下，画面不跳。
 *
 * 这两条只有在「米 ↔ 像素」换算正确（偏移 × pixelsPerMeter）且回换算时拿得到造型 / 姿态
 * 字段的前提下才成立；漏掉任一条都会让半圆柱 / 四分之一圆柱每拖一次就整体错开半个占位。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const postureModuleUrl = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/items/studio-item-posture.ts',
    import.meta.url,
  ),
)
const geometryModuleUrl = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/app/3d-studio/plan/geometry.ts', import.meta.url),
)
const { resizeRotatedItemFromCorner } = await import(geometryModuleUrl)
const {
  itemFromPlanFootprintResize,
  itemPlanFootprint,
  itemPlanFootprintOffset,
  itemWithPlanFootprint,
} = await import(postureModuleUrl)

const EPSILON_METERS = 1e-9

/** 与 `buildHandleGeometry` 同口径：占位框四角（平面像素）与对角点。 */
function frameCorners(item, pixelsPerMeter) {
  const footprint = itemPlanFootprint(item),
    offset = itemPlanFootprintOffset(item),
    rotationRad = ((Number(item.rotation) || 0) * Math.PI) / 180,
    rotationCos = Math.cos(rotationRad),
    rotationSin = Math.sin(rotationRad),
    halfWidthPx = (footprint.width * pixelsPerMeter) / 2,
    halfDepthPx = (footprint.depth * pixelsPerMeter) / 2;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([directionX, directionY]) => {
    const rotate = (localX, localY) => ({
      x: item.x + localX * rotationCos - localY * rotationSin,
      y: item.y + localX * rotationSin + localY * rotationCos,
    })
    return {
      directionX,
      directionY,
      point: rotate(
        offset.x * pixelsPerMeter + directionX * halfWidthPx,
        offset.y * pixelsPerMeter + directionY * halfDepthPx,
      ),
      opposite: rotate(
        offset.x * pixelsPerMeter - directionX * halfWidthPx,
        offset.y * pixelsPerMeter - directionY * halfDepthPx,
      ),
    }
  })
}

/** 走一遍真实的缩放手势：按下角手柄 → 指针拖到 `dragPixels` 之外 → 换算回物件字段。 */
function dragCorner(item, corner, dragPixels, pixelsPerMeter) {
  const rotationRad = ((Number(item.rotation) || 0) * Math.PI) / 180,
    rotationCos = Math.cos(rotationRad),
    rotationSin = Math.sin(rotationRad),
    target = {
      x:
        corner.point.x +
        (corner.directionX * rotationCos - corner.directionY * rotationSin) * dragPixels,
      y:
        corner.point.y +
        (corner.directionX * rotationSin + corner.directionY * rotationCos) * dragPixels,
    },
    resizedRectangle = resizeRotatedItemFromCorner(
      itemWithPlanFootprint(item, pixelsPerMeter),
      { x: corner.directionX, y: corner.directionY },
      corner.opposite,
      target,
      pixelsPerMeter,
      false,
      { minimumDimension: 0.05 },
    );
  return {
    target,
    resized: Object.assign(
      {},
      item,
      itemFromPlanFootprintResize(item, resizedRectangle, pixelsPerMeter),
    ),
  }
}

function pillarItem(pillarShape, overrides = {}) {
  return {
    id: 'pillar-' + pillarShape,
    type: 'pillar',
    pillarShape,
    pillarAxis: 'vertical',
    x: 320,
    y: 240,
    rotation: 0,
    width: 0.45,
    depth: pillarShape === 'semicircle' ? 0.225 : 0.45,
    height: 2.8,
    ...overrides,
  }
}

test('拖角缩放：对角钉住、被拖的角跟着指针（立柱各造型 × 各角度）', () => {
  for (const pixelsPerMeter of [50, 100, 240])
    for (const pillarShape of ['square', 'round', 'semicircle', 'quarter', 'quarterinner'])
      for (const rotation of [0, 37, 90, 180, 270])
        for (const cornerIndex of [0, 2]) {
          const item = pillarItem(pillarShape, { rotation }),
            corner = frameCorners(item, pixelsPerMeter)[cornerIndex],
            { target, resized } = dragCorner(item, corner, 24, pixelsPerMeter),
            resizedCorners = frameCorners(resized, pixelsPerMeter),
            resizedCorner = resizedCorners[cornerIndex],
            resizedOpposite = resizedCorners.find(
              (candidate) =>
                candidate.directionX === -corner.directionX &&
                candidate.directionY === -corner.directionY,
            ),
            label = `${pillarShape} rot=${rotation} ppm=${pixelsPerMeter} corner=${corner.directionX},${corner.directionY}`;

          assert.ok(
            Math.hypot(
              resizedOpposite.point.x - corner.opposite.x,
              resizedOpposite.point.y - corner.opposite.y,
            ) /
              pixelsPerMeter <=
              EPSILON_METERS,
            `${label}: 对角没有钉住`,
          )
          assert.ok(
            Math.hypot(
              resizedCorner.point.x - target.x,
              resizedCorner.point.y - target.y,
            ) /
              pixelsPerMeter <=
              EPSILON_METERS,
            `${label}: 手柄没有跟住指针`,
          )
        }
})

test('拖角缩放：立姿灯带的平面「宽」驱动灯带长度（height），不驱动灯带厚度', () => {
  const item = {
      id: 'strip',
      type: 'striplight',
      stripAxis: 'vertical',
      x: 300,
      y: 260,
      rotation: 0,
      width: 0.04,
      depth: 0.28,
      height: 2,
      elevation: 0,
    },
    pixelsPerMeter = 100,
    corner = frameCorners(item, pixelsPerMeter)[2],
    { resized } = dragCorner(item, corner, 30, pixelsPerMeter);

  assert.ok(Math.abs(resized.width - item.width) < EPSILON_METERS, `灯带厚度被改了：${resized.width}`)
  assert.ok(
    Math.abs(resized.height - (item.height + 0.3)) < 1e-6,
    `灯带长度没有跟着平面宽走：${resized.height}`,
  )
  assert.ok(Math.abs(resized.depth - (item.depth + 0.3)) < 1e-6, `灯带进深没有跟着平面深走：${resized.depth}`)
})

test('拖角缩放：躺姿立柱的平面「深」驱动立柱长度（height），截面进深保持', () => {
  const item = {
      id: 'lying',
      type: 'pillar',
      pillarShape: 'semicircle',
      pillarAxis: 'horizontal',
      x: 300,
      y: 260,
      rotation: 0,
      width: 0.45,
      depth: 0.225,
      height: 2.8,
    },
    pixelsPerMeter = 100,
    corner = frameCorners(item, pixelsPerMeter)[2],
    { resized } = dragCorner(item, corner, 30, pixelsPerMeter);

  assert.ok(Math.abs(resized.width - (item.width + 0.3)) < 1e-6, `立柱截面宽没有变：${resized.width}`)
  assert.ok(Math.abs(resized.height - (item.height + 0.3)) < 1e-6, `立柱长度没有跟着平面深走：${resized.height}`)
  assert.ok(Math.abs(resized.depth - item.depth) < EPSILON_METERS, `截面进深被改了：${resized.depth}`)
})

test('拖角缩放：默认跟手到任意尺寸，不再按家具步进量化', () => {
  // 0.7.8 的拖拽缩放把宽度吸附到 5cm 网格，用户拖不出 1.473 / 1.4739 这种值。
  // 现在默认不吸附（跟手），只有调用方显式给 widthStep / depthStep 才量化（Alt）。
  const pixelsPerMeter = 100,
    item = {
      id: 'sofa',
      type: 'sofa',
      x: 300,
      y: 260,
      rotation: 0,
      width: 2,
      depth: 1,
      height: 0.8,
    },
    anchor = { x: 200, y: 210 },
    corner = { x: 1, y: 1 },
    resizeTo = (target) =>
      resizeRotatedItemFromCorner(item, corner, anchor, target, pixelsPerMeter, false, {
        minimumDimension: 0.1,
      });

  const freeResize = resizeTo({ x: anchor.x + 147.3, y: anchor.y + 100 })
  assert.equal(freeResize.width, 1.473, `跟手尺寸被量化了：${freeResize.width}`)
  assert.equal(freeResize.depth, 1)

  const subMillimetreResize = resizeTo({ x: anchor.x + 147.39, y: anchor.y + 100 })
  assert.equal(subMillimetreResize.width, 1.4739, `跟手尺寸被量化了：${subMillimetreResize.width}`)

  // 显式给了步进（Alt）才落回 5cm 网格：1.473 → 1.45。
  const steppedResize = resizeRotatedItemFromCorner(
    item,
    corner,
    anchor,
    { x: anchor.x + 147.3, y: anchor.y + 100 },
    pixelsPerMeter,
    false,
    { minimumDimension: 0.1, widthStep: 0.05, depthStep: 0.05 },
  )
  assert.equal(steppedResize.width, 1.45)
  assert.equal(steppedResize.depth, 1)
})

test('拖角缩放：结果不带浮点尾巴（像素换算的 0.30000000000000004）', () => {
  const pixelsPerMeter = 100,
    item = { id: 'table', type: 'table', x: 300, y: 260, rotation: 0, width: 1, depth: 1, height: 0.75 },
    anchor = { x: 250, y: 210 },
    resized = resizeRotatedItemFromCorner(
      item,
      { x: 1, y: 1 },
      anchor,
      { x: 293.7, y: 253.1 },
      pixelsPerMeter,
      true,
      { minimumDimension: 0.1 },
    );

  for (const [label, value] of [
    ['width', resized.width],
    ['depth', resized.depth],
    ['height', resized.height],
  ]) {
    assert.ok(
      Math.abs(value * 1e6 - Math.round(value * 1e6)) < 1e-6,
      `${label} 带浮点尾巴：${value}`,
    )
  }
  // 等比例缩放（Shift）：宽 / 深 / 高都按较大的一侧比例走。
  assert.equal(resized.width, 0.437)
  assert.equal(resized.depth, 0.437)
  assert.equal(resized.height, 0.32775)
})

test('拖角缩放：调用方不再把家具步进塞给缩放（否则又变回固定刻度）', () => {
  const pointerUpSource = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/functions/handlePointerUp.ts',
          import.meta.url,
        ),
      ),
      'utf8',
    ),
    resizeBranchStart = pointerUpSource.indexOf('marqueeBox.type === "resize-item"'),
    resizeBranchEnd = pointerUpSource.indexOf('marqueeBox.type === "rotate-item"'),
    resizeBranch = pointerUpSource.slice(resizeBranchStart, resizeBranchEnd)

  assert.ok(resizeBranchStart > 0 && resizeBranchEnd > resizeBranchStart, '找不到 resize-item 分支')
  for (const forbiddenStep of ['widthStep', 'depthStep'])
    assert.ok(
      !resizeBranch.includes(forbiddenStep),
      `resize-item 分支又出现了 ${forbiddenStep}：鼠标缩放会退回固定步长`,
    )
})
