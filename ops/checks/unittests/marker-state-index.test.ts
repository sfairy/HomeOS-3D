/**
 * 3D 标签实体索引的单测（0.8.9 `createMarkerStateIndex`）。
 *
 * 「改善标签显示与命中」有两半：样式（CSS 层级）与**刷新范围**（这一帧该重画哪些标签）。
 * 这个索引负责后半段。错了的表现很隐蔽：标签不更新、或每帧都全量重画（掉帧）。
 */
import { describe, expect, test } from 'bun:test'

import { createMarkerStateIndex } from '../../../homeos/frontend/src/studio/runtime/core/state-update-plan'

describe('createMarkerStateIndex', () => {
  test('单实体标签可反查', () => {
    const index = createMarkerStateIndex([{ id: 'm1', entityId: 'light.a' }])
    expect(index.markersForEntity('light.a')).toEqual(['m1'])
    expect(index.size).toBe(1)
  })

  test('多实体标签在任一变更时都受影响', () => {
    const index = createMarkerStateIndex([{ id: 'm1', entityIds: ['light.a', 'light.b'] }])
    expect(index.markersForEntity('light.b')).toEqual(['m1'])
    expect(index.affectedBy(['light.a'])).toEqual(['m1'])
    expect(index.affectedBy(['light.b'])).toEqual(['m1'])
  })

  test('多个标签共享实体时全部返回', () => {
    const index = createMarkerStateIndex([
      { id: 'm1', entityId: 'light.a' },
      { id: 'm2', entityIds: ['light.a', 'switch.b'] },
    ])
    expect(index.affectedBy(['light.a']).sort()).toEqual(['m1', 'm2'])
  })

  test('变更结果去重', () => {
    const index = createMarkerStateIndex([{ id: 'm1', entityIds: ['light.a', 'light.b'] }])
    expect(index.affectedBy(['light.a', 'light.b'])).toEqual(['m1'])
  })

  test('未绑定的实体返回空', () => {
    const index = createMarkerStateIndex([{ id: 'm1', entityId: 'light.a' }])
    expect(index.markersForEntity('light.zzz')).toEqual([])
    expect(index.affectedBy(['light.zzz'])).toEqual([])
    expect(index.affects(['light.zzz'])).toBe(false)
  })

  test('affects 用于整帧快速跳过', () => {
    const index = createMarkerStateIndex([{ id: 'm1', entityId: 'light.a' }])
    expect(index.affects(['light.a'])).toBe(true)
    expect(index.affects([])).toBe(false)
  })

  test('兼容 entityId 与 entityIds 同时存在的脏数据', () => {
    const index = createMarkerStateIndex([{ id: 'm1', entityId: 'light.a', entityIds: ['light.b'] }])
    expect(
      index
        .affectedBy(['light.a'])
        .concat(index.affectedBy(['light.b']))
        .sort(),
    ).toEqual(['m1', 'm1'])
  })

  test('忽略没有实体绑定的标签（不进 size）', () => {
    const index = createMarkerStateIndex([{ id: 'empty' }, { id: 'm1', entityId: 'light.a' }])
    expect(index.size).toBe(1)
    expect(index.markersForEntity('empty')).toEqual([])
  })

  test('缺 id 时按位置生成，仍可反查', () => {
    const index = createMarkerStateIndex([{ entityId: 'light.a' }])
    expect(index.markersForEntity('light.a')).toEqual(['marker-0'])
  })

  test('非字符串实体被丢弃', () => {
    const index = createMarkerStateIndex([{ id: 'm1', entityIds: ['light.a', 42, null, '  '] as unknown as string[] }])
    expect(index.markersForEntity('light.a')).toEqual(['m1'])
    expect(index.size).toBe(1)
  })

  test('空输入安全', () => {
    const index = createMarkerStateIndex([])
    expect(index.size).toBe(0)
    expect(index.affectedBy(['light.a'])).toEqual([])
  })

  test('返回的数组已冻结（调用方误改会立即失败，而不是悄悄污染索引）', () => {
    const index = createMarkerStateIndex([{ id: 'm1', entityId: 'light.a' }])
    const first = index.markersForEntity('light.a') as string[]
    expect(Object.isFrozen(first)).toBe(true)
    expect(() => first.push('hacked')).toThrow()
    expect(index.markersForEntity('light.a')).toEqual(['m1'])
  })
})
