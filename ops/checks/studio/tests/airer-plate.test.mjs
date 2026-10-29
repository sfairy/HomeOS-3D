/**
 * 单杆晾衣架开孔挂板的契约测试（0.8.1 新增 `rack-plate`）。
 *
 * 失败模式全是视觉/物理问题，不抛异常：
 * - 孔少了或没开 → 单杆机型变成一块实心板，用户看不出这是「晾衣杆穿过挂板」；
 * - 孔落在板外 → 挤出几何出现自交，阴影上出现黑斑；
 * - 板宽不随 `width` 缩放 → 杆比板长，杆头露在板外。
 *
 * 所以断言：21 个孔、左右对称、等距、全部在板内、缩放按 `width / 1.9`。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PLATE = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/items/studio-airer-plate.ts',
    import.meta.url,
  ),
)
const AIRER = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/items/studio-airer.ts',
    import.meta.url,
  ),
)
const {
  AIRER_PLATE_WIDTH,
  AIRER_PLATE_HOLE_COUNT,
  AIRER_PLATE_HOLE_RADIUS,
  AIRER_PLATE_HOLE_SPACING,
  airerPlateScale,
  singleAirerPlateHoleOffsets,
} = await import(PLATE)

test('21 个孔，左右对称，等距', () => {
  const offsets = singleAirerPlateHoleOffsets()
  assert.equal(offsets.length, AIRER_PLATE_HOLE_COUNT)
  assert.equal(offsets.length, 21)
  assert.equal(offsets.length % 2, 1, '孔数必须是奇数，正中才有一个孔')
  assert.equal(offsets[10], 0)
  for (let index = 0; index < offsets.length; index++) {
    assert.ok(
      Math.abs(offsets[index] + offsets[offsets.length - 1 - index]) < 1e-12,
      `第 ${index} 个孔与对称孔不对称`,
    )
    if (index > 0) {
      assert.ok(
        Math.abs(offsets[index] - offsets[index - 1] - AIRER_PLATE_HOLE_SPACING) < 1e-12,
        '孔间距必须恒定',
      )
    }
  }
})

test('所有孔完整落在板内（含孔径余量）', () => {
  const half = AIRER_PLATE_WIDTH / 2
  for (const offset of singleAirerPlateHoleOffsets()) {
    assert.ok(Math.abs(offset) + AIRER_PLATE_HOLE_RADIUS < half, `孔 ${offset} 越过板边`)
  }
})

test('板宽缩放按 width / 1.9 整体处理，不逐孔重排', () => {
  assert.equal(airerPlateScale(1.9), 1)
  assert.equal(airerPlateScale(2.28), 2.28 / 1.9)
  // 非法宽度不缩放（避免 NaN 矩阵把整块板从场景里抹掉）。
  assert.equal(airerPlateScale(0), 1)
  assert.equal(airerPlateScale(-1), 1)
  assert.equal(airerPlateScale(Number.NaN), 1)
  assert.equal(airerPlateScale(Number.POSITIVE_INFINITY), 1)
})

test('模型代码实际用上这套常量（不残留 1.9 / 0.0075 魔法数）', () => {
  const source = readFileSync(AIRER, 'utf8')
  assert.match(source, /airerPlateScale\(dimensions\.width\)/)
  assert.match(source, /AIRER_PLATE_HOLE_RADIUS/)
  assert.match(source, /AIRER_PLATE_WIDTH/)
  assert.doesNotMatch(source, /dimensions\.width \/ 1\.9/)
  assert.doesNotMatch(source, /absarc\(holeOffset, 0, 0\.0075/)
  assert.equal(source.match(/rack-plate/g)?.length, 1, 'plateGeometry 必须命名为 rack-plate')
})
