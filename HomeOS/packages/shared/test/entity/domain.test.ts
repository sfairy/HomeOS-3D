/**
 * @file domain.test.ts
 * @module @homeos/shared/entity
 * @brief 实体领域解析工具的单元测试。
 *
 * 职责：
 *  - 验证 getEntityDomain 从 entity_id 中正确切分领域前缀（如 light.living_room → light）；
 *  - 验证空字符串、无点号、点号后为空等无效输入的边界处理。
 *
 * 约定：
 *  - entity_id 格式为 domain.object_id，点号前的部分即领域；
 *  - 任何无法解析的输入统一返回空字符串，不抛异常。
 */
import { describe, expect, test } from 'bun:test'
import { getEntityDomain } from '../../src/entity/domain'

describe('getEntityDomain', () => {
  test('splits domain from entity_id', () => {
    expect(getEntityDomain('light.living_room')).toBe('light')
    expect(getEntityDomain('climate.ac')).toBe('climate')
  })
  test('empty or invalid ids', () => {
    expect(getEntityDomain('')).toBe('')
    expect(getEntityDomain('nodot')).toBe('')
    expect(getEntityDomain('.living')).toBe('')
  })
})
