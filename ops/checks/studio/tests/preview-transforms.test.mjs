/**
 * 预览变换缓存的契约（0.8.1 B4）。
 *
 * 平面视图拖拽只改 x/y/rotation，其他字段（备注、颜色…）不该让整批作废。
 * 判错的表现是「拖一下就整层重建」，不会报错，只能靠用例钉住。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const moduleUrl = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/studio-preview-transforms.ts',
    import.meta.url,
  ),
)
const { createPreviewTransformCache } = await import(moduleUrl)

const root = { isObject3D: true }
const groupFor = (item) => ({ item, parent: root })
const groupRecord = (item, group = groupFor(item)) => ({ item, group })
const context = (items, groups = items.map((item) => groupRecord(item))) => ({
  items,
  contextKey: 'scene-a',
  isEligible: () => true,
  isSelected: (item) => item.selected === true,
  groups,
})

test('仅移动 x/y/rotation：plan 产出替换清单，commit 推进基线', () => {
  const cache = createPreviewTransformCache()
  const item = { id: 'sofa', x: 1, y: 2, rotation: 0, selected: true }
  const group = groupFor(item)
  assert.equal(cache.capture(root, context([item], [groupRecord(item, group)])), true)

  item.x = 3
  item.rotation = Math.PI / 2
  const replacements = cache.planReplacements(root, context([item], [groupRecord(item, group)]))
  assert.equal(replacements.length, 1)
  assert.equal(replacements[0].group, group)
  assert.equal(replacements[0].x, 3)
  assert.equal(cache.commitReplacements(root, replacements), true)
  assert.deepEqual(cache.planReplacements(root, context([item], [groupRecord(item, group)])), [])
})

test('remark 变化不参与签名（备注不触发重建）', () => {
  const cache = createPreviewTransformCache()
  const item = { id: 'lamp', x: 0, y: 0, rotation: 0, selected: true, remark: '旧备注' }
  assert.equal(cache.capture(root, context([item])), true)
  item.remark = '新备注'
  item.x = 1
  const replacements = cache.planReplacements(root, context([item]))
  assert.equal(replacements.length, 1)
  assert.equal(replacements[0].x, 1)
})

test('非变换字段变化让整批作废', () => {
  const cache = createPreviewTransformCache()
  const item = { id: 'lamp', x: 0, y: 0, rotation: 0, selected: true, color: '#fff' }
  assert.equal(cache.capture(root, context([item])), true)
  item.color = '#000'
  item.x = 1
  assert.equal(cache.planReplacements(root, context([item])), null)
})

test('未选中或组不在根下：plan 返回 null（宁可重建也别错位）', () => {
  const cache = createPreviewTransformCache()
  const item = { id: 'lamp', x: 0, y: 0, rotation: 0, selected: true }
  const detachedGroup = { item, parent: { isObject3D: true } }
  assert.equal(cache.capture(root, context([item], [groupRecord(item, detachedGroup)])), true)
  item.x = 1
  assert.equal(cache.planReplacements(root, context([item], [groupRecord(item, detachedGroup)])), null)
})
