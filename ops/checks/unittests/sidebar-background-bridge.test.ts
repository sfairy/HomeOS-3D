/**
 * 「共享组件 → Vue 侧边栏」桥接的单测（0.9.0）。
 *
 * 桥接的价值就是「同一个背景在两处长得一样」，所以这里钉住三件事：
 *
 * 1. 只认 `sharedComponents` 顶层的 `page-background`（嵌套/页面级层不参与）；
 * 2. 自由布局把组件 px 盒折算成**相对百分比**，铺满模式直接铺满；
 * 3. 发布 / 订阅是单向的，且相同快照不重复通知（否则每次轮询都会重绘背景层）。
 */
import { describe, expect, test } from 'bun:test'

import {
  clearSharedSidebarBackground,
  getSharedSidebarBackground,
  publishSharedSidebarBackground,
  sharedSidebarPositionPercentages,
  sidebarBackgroundFromSharedComponent,
  subscribeSharedSidebarBackground,
} from '../../../homeos/frontend/src/kernel/dashboard/shared-sidebar-background'

function sharedBackground(properties: Record<string, unknown>, position?: Record<string, unknown>) {
  return {
    id: 'bg-shared',
    type: 'page-background',
    properties,
    ...(position ? { position } : {}),
  }
}

function documentWith(sharedComponents: unknown[]) {
  return {
    canvas: { width: 1000, height: 500 },
    sharedComponents,
    pages: [{ id: 'page-1', path: 'home', components: [] }],
  }
}

describe('sidebarBackgroundFromSharedComponent', () => {
  test('没有共享背景时返回 null（侧边栏回退到本地设置）', () => {
    expect(sidebarBackgroundFromSharedComponent(documentWith([]))).toBeNull()
    expect(sidebarBackgroundFromSharedComponent(undefined)).toBeNull()
  })

  test('页面级层里的背景不算共享背景', () => {
    expect(
      sidebarBackgroundFromSharedComponent({
        canvas: { width: 1000, height: 500 },
        sharedComponents: [],
        pages: [{ id: 'page-1', components: [sharedBackground({})] }],
      }),
    ).toBeNull()
  })

  test('铺满模式原样透传（预设 / 透明度 / 来源）', () => {
    const background = sidebarBackgroundFromSharedComponent(
      documentWith([
        sharedBackground({
          backgroundSource: 'preset',
          preset: 'warm-wood/warm-dusk',
          opacity: 0.4,
          layoutMode: 'fill',
        }),
      ]),
    )
    expect(background?.backgroundSource).toBe('preset')
    expect(background?.preset).toBe('warm-wood/warm-dusk')
    expect(background?.opacity).toBe(0.4)
    expect(background?.layoutMode).toBe('fill')
    expect(background?.legacyPosition).toBeUndefined()
  })

  test('自由布局把组件 px 盒折算成百分比', () => {
    const background = sidebarBackgroundFromSharedComponent(
      documentWith([
        sharedBackground(
          { backgroundSource: 'image', assetId: 'user:abc', layoutMode: 'free' },
          { x: 250, y: 100, width: 500, height: 250 },
        ),
      ]),
    )
    expect(background?.layoutMode).toBe('free')
    expect(background?.legacyPosition).toEqual({ x: 25, y: 20, width: 50, height: 50 })
  })

  test('自由布局但组件盒不可用时退回铺满（不画一块尺寸未知的图）', () => {
    const background = sidebarBackgroundFromSharedComponent(
      documentWith([sharedBackground({ layoutMode: 'free' }, { x: 10, y: 10, width: 0, height: 0 })]),
    )
    expect(background?.layoutMode).toBe('free')
    expect(background?.legacyPosition).toBeUndefined()
  })
})

describe('sharedSidebarPositionPercentages', () => {
  test('按画布折算，宽高最小 0.1%', () => {
    expect(
      sharedSidebarPositionPercentages({ x: 0, y: 0, width: 1, height: 0.1 }, { width: 1000, height: 500 }),
    ).toEqual({ x: 0, y: 0, width: 0.1, height: 0.1 })
  })

  test('缺 x/y 视为 0，缺尺寸视为不可用', () => {
    const percentages = sharedSidebarPositionPercentages({ width: 100, height: 100 })
    // 缺省画布 2778×1940（与 0.9.0 渲染器一致）。
    expect(percentages?.x).toBe(0)
    expect(percentages?.y).toBe(0)
    expect(percentages?.width).toBeCloseTo(3.6, 1)
    expect(percentages?.height).toBeCloseTo(5.15, 1)
    expect(sharedSidebarPositionPercentages({ x: 1, y: 1 })).toBeUndefined()
    expect(sharedSidebarPositionPercentages(null)).toBeUndefined()
  })
})

describe('快照发布 / 订阅', () => {
  test('发布后能读到归一化后的背景', () => {
    publishSharedSidebarBackground(
      'project-1',
      documentWith([sharedBackground({ backgroundSource: 'preset', opacity: 60 })]),
    )
    const snapshot = getSharedSidebarBackground()
    expect(snapshot.projectId).toBe('project-1')
    // 旧文档的 0–100 透明度会被折算成 0–1（与主页面同口径）。
    expect(snapshot.background?.opacity).toBe(0.6)
    clearSharedSidebarBackground()
  })

  test('相同快照不重复通知', () => {
    let notifyCount = 0
    const unsubscribe = subscribeSharedSidebarBackground(() => {
      notifyCount += 1
    })
    const documentPayload = documentWith([sharedBackground({ backgroundSource: 'preset' })])
    publishSharedSidebarBackground('project-1', documentPayload)
    publishSharedSidebarBackground('project-1', documentPayload)
    expect(notifyCount).toBe(1)
    unsubscribe()
    clearSharedSidebarBackground()
  })

  test('清空后回落到「没有共享背景」', () => {
    publishSharedSidebarBackground('project-1', documentWith([sharedBackground({})]))
    clearSharedSidebarBackground()
    expect(getSharedSidebarBackground().background).toBeNull()
    expect(getSharedSidebarBackground().projectId).toBe('')
  })

  test('取消订阅后不再收到通知', () => {
    let notifyCount = 0
    const unsubscribe = subscribeSharedSidebarBackground(() => {
      notifyCount += 1
    })
    unsubscribe()
    publishSharedSidebarBackground('project-2', documentWith([sharedBackground({})]))
    expect(notifyCount).toBe(0)
    clearSharedSidebarBackground()
  })
})
