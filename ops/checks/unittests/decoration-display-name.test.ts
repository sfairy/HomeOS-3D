/**
 * 装饰的**显示名**在四个位置必须一致（0.8.9）。
 *
 * 同一个模型名要在这些地方都出现，任何一处退回目录名（「我的装饰」）都会让用户
 * 分不出自己选的是哪一件：
 *
 * 1. 属性面板标题（`itemSelectionTitle`）
 * 2. 画布上「重叠物件」浮层的候选行（`overlap-and-preview-wiring`）
 * 3. 「已放置」清单（`placedItemName`）
 * 4. 卡片名称与拖拽落位写入的 `name`
 *
 * 前三者此前**各自独立**地用「类型 → 目录名」查表，于是只有第 1 处（后修的）是对的。
 */
import { describe, expect, test } from 'bun:test'

import { itemSelectionTitle } from '../../../homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/ui/refreshStudioUiInner'
import { placedItemName } from '../../../homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/ui/studio-placed-items'
import { overlapCandidateLabel } from '../../../homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/ui/overlap-and-preview-wiring'

/** 目录项：装饰统一叫「我的装饰」。 */
const CATALOG = { 'user-decoration': { name: '我的装饰' }, sofa: { name: '沙发' } }

describe('属性面板标题', () => {
  test('装饰用模型名', () => {
    expect(itemSelectionTitle({ type: 'user-decoration', name: '青花瓷瓶' }, { name: '我的装饰' })).toBe('青花瓷瓶')
  })

  test('读上游键 modelName', () => {
    expect(itemSelectionTitle({ type: 'user-decoration', modelName: '落地灯' }, { name: '我的装饰' })).toBe('落地灯')
  })
})

describe('已放置清单', () => {
  test('装饰用模型名，且优先于目录名', () => {
    // 目录名优先是此前的实现：清单里每一件装饰都显示「我的装饰」。
    expect(placedItemName({ type: 'user-decoration', name: '青花瓷瓶' }, CATALOG)).toBe('青花瓷瓶')
  })

  test('读上游键 modelName', () => {
    expect(placedItemName({ type: 'user-decoration', modelName: '落地灯' }, CATALOG)).toBe('落地灯')
  })

  test('非装饰类型仍用目录名（不被 item.name 覆盖）', () => {
    expect(placedItemName({ type: 'sofa', name: '自定义' }, CATALOG)).toBe('沙发')
  })

  test('装饰缺名时回落目录名（不留空串）', () => {
    expect(placedItemName({ type: 'user-decoration' }, CATALOG)).toBe('我的装饰')
  })

  test('灯组后缀仍然生效（装饰一般无灯组，但逻辑不能破坏）', () => {
    expect(
      placedItemName({ type: 'user-decoration', name: '壁灯', lightGroupId: 'g1' }, CATALOG, [
        { id: 'g1', name: '床头灯组' },
      ]),
    ).toBe('壁灯 · 床头灯组')
  })
})

describe('重叠物件浮层', () => {
  const typeNames = { 'user-decoration': '我的装饰', sofa: '沙发' }

  test('装饰用模型名（否则六行全叫「我的装饰」）', () => {
    expect(overlapCandidateLabel({ type: 'user-decoration', name: '青花瓷瓶' }, typeNames)).toBe('青花瓷瓶')
  })

  test('读上游键 modelName', () => {
    expect(overlapCandidateLabel({ type: 'user-decoration', modelName: '落地灯' }, typeNames)).toBe('落地灯')
  })

  test('非装饰用目录名', () => {
    expect(overlapCandidateLabel({ type: 'sofa', name: '自定义' }, typeNames)).toBe('沙发')
  })

  test('装饰缺名回落目录名', () => {
    expect(overlapCandidateLabel({ type: 'user-decoration' }, typeNames)).toBe('我的装饰')
  })

  test('目录也查不到时回落类型 id（不留空串）', () => {
    expect(overlapCandidateLabel({ type: 'mystery' }, {})).toBe('mystery')
  })
})
