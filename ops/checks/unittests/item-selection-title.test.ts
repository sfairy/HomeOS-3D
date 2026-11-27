/**
 * 属性面板标题的单测（0.8.9）。
 *
 * 用户装饰的目录名统一是「我的装饰」，所以标题必须改用**模型名** ——
 * 否则选中一件装饰时，属性面板只告诉用户「你选了一个装饰」，
 * 而看不出选的是哪一个（截图对比里最直观的差异之一）。
 */
import { describe, expect, test } from 'bun:test'

import { itemSelectionTitle } from '../../../homeos/frontend/src/studio/authoring/ui/refresh-view'

describe('属性面板标题', () => {
  test('用户装饰用模型名', () => {
    expect(itemSelectionTitle({ type: 'user-decoration', name: '矮墙' }, { name: '我的装饰' })).toBe('矮墙')
  })

  test('用户装饰缺名时回落目录名（不显示空白标题）', () => {
    expect(itemSelectionTitle({ type: 'user-decoration' }, { name: '我的装饰' })).toBe('我的装饰')
    expect(itemSelectionTitle({ type: 'user-decoration', name: '' }, { name: '我的装饰' })).toBe('我的装饰')
  })

  test('用户装饰的 name 非字符串时回落目录名', () => {
    expect(itemSelectionTitle({ type: 'user-decoration', name: 123 }, { name: '我的装饰' })).toBe('我的装饰')
  })

  test('其它类型一律用目录名（不被 item.name 覆盖）', () => {
    expect(itemSelectionTitle({ type: 'sofa', name: '自定义名' }, { name: '沙发' })).toBe('沙发')
    expect(itemSelectionTitle({ type: 'wallac', name: 'x' }, { name: '挂机空调' })).toBe('挂机空调')
  })

  test('目录项缺失时兜底「物件」', () => {
    expect(itemSelectionTitle({ type: 'unknown-type' }, undefined)).toBe('物件')
  })
})
