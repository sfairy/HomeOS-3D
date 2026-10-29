/**
 * 关联实体的旧配置兼容（0.8.1 B5）。
 *
 * `relatedEntities` 曾直接是数组（或挂在 `relatedEntityIds` 上），0.8.1 改成
 * `{ mode, entityIds }`。旧组件落盘后不能因为形状变了就丢掉全部关联。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const moduleUrl = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/app/shared/related-entities.ts', import.meta.url),
)
const { legacyRelatedEntityIds, selectedRelatedEntityIds } = await import(moduleUrl)

test('旧形状：properties.relatedEntities 为数组', () => {
  assert.deepEqual(
    legacyRelatedEntityIds({
      properties: { relatedEntities: ['light.a', ' switch.b ', 'light.a', ''] },
    }),
    ['light.a', 'switch.b'],
  )
})

test('旧形状：relatedEntityIds 字段', () => {
  assert.deepEqual(legacyRelatedEntityIds({ properties: { relatedEntityIds: ['fan.c'] } }), [
    'fan.c',
  ])
})

test('新形状：selected / all 都走新逻辑，legacy 返回原样 id 列表', () => {
  const selectedConfig = {
    properties: { relatedEntities: { mode: 'selected', entityIds: ['light.a'] } },
  }
  assert.deepEqual(legacyRelatedEntityIds(selectedConfig), ['light.a'])
  assert.deepEqual(selectedRelatedEntityIds(selectedConfig), ['light.a'])
  assert.equal(
    selectedRelatedEntityIds({ properties: { relatedEntities: { mode: 'all' } } }),
    null,
  )
})

test('无相关配置时 legacy 为 null（区别于显式空选）', () => {
  assert.equal(legacyRelatedEntityIds({ properties: {} }), null)
  assert.deepEqual(
    selectedRelatedEntityIds({
      properties: { relatedEntities: { mode: 'selected', entityIds: [] } },
    }),
    [],
  )
})
