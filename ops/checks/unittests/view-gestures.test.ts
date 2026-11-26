/**
 * 3D 单层浏览手势的单测（0.8.9）。
 *
 * 手势逻辑错了的表现都很「软」：画面某个方向转反、捏合时画面同时乱跑、拖完松开
 * 又跳一下。所以这里钉住的是**增量语义**而不是最终画面：
 *
 * 1. 单指未超过 slop 不产生旋转（否则「点一下」会顺手把视角转一点）；
 * 2. 双指间距变化走 zoom，中点位移走 pan，两者不混；
 * 3. 双指退回单指后原点会重设（否则会跳一段等于旧中点到新手指的距离）；
 * 4. `canStart` / `claim` 任一拒绝就完全不介入（点击与长按路径不受影响）。
 */
import { describe, expect, test } from 'bun:test'

/** 手势事件的测试桩：只带手势判定真正读的字段（避免用 `any` 绕过类型门禁）。 */
type GestureEventStub = {
  pointerId?: number
  clientX?: number
  clientY?: number
  button?: number
  isPrimary?: boolean
  pointerType?: string
  preventDefault?: () => void
  stopPropagation?: () => void
  target?: unknown
}

import {
  VIEW_GESTURE_DRAG_SLOP,
  installViewGestures,
  type ViewGestureIntent,
} from '../../../homeos/frontend/src/studio/runtime/core/view-gestures'

/** 最小元素桩：只收集监听器，允许测试手动派发。 */
function fakeSurface() {
  const listeners = new Map<string, Set<(event: GestureEventStub) => void>>()
  return {
    addEventListener(type: string, handler: (event: GestureEventStub) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(handler)
    },
    emit(type: string, event: GestureEventStub) {
      for (const handler of listeners.get(type) ?? []) handler(event)
    },
    count(type: string) {
      return listeners.get(type)?.size ?? 0
    },
    asElement() {
      return this as unknown as Element
    },
  }
}

function pointer(id: number, x: number, y: number): GestureEventStub {
  return { pointerId: id, clientX: x, clientY: y, button: 0, isPrimary: id === 1 }
}

function setup(overrides: Record<string, unknown> = {}) {
  const surface = fakeSurface()
  const intents: ViewGestureIntent[] = []
  const kinds: string[] = []
  let now = 0
  const handle = installViewGestures({
    surface: surface.asElement(),
    canStart: () => true,
    claim: (kind) => {
      kinds.push(kind)
      return true
    },
    begin: (intent) => {
      intents.push(intent)
    },
    // 关闭同帧合并：单测要看到每一次增量。
    minIntervalMs: 0,
    ...overrides,
  })
  return { surface, intents, kinds, handle, tick: () => (now += 100) }
}

describe('installViewGestures · 单指旋转', () => {
  test('未超过 slop 不产生旋转', () => {
    const { surface, intents } = setup()
    surface.emit('pointerdown', pointer(1, 100, 100))
    surface.emit('pointermove', pointer(1, 100 + VIEW_GESTURE_DRAG_SLOP - 1, 100))
    expect(intents).toHaveLength(0)
  })

  test('超过 slop 后按灵敏度产生 rotate', () => {
    const { surface, intents } = setup()
    // 让合并窗口放过第一条 move：先等一帧。
    surface.emit('pointerdown', pointer(1, 0, 0))
    {
      surface.emit('pointermove', pointer(1, 100, 0))
    }
    expect(intents).toHaveLength(1)
    expect(intents[0]!.kind).toBe('rotate')
    expect(intents[0]!.dx).toBeGreaterThan(0)
    expect(intents[0]!.dy).toBe(0)
  })

  test('claim 被拒时不介入（点击路径不受影响）', () => {
    const surface = fakeSurface()
    const intents: ViewGestureIntent[] = []
    const claims: string[] = []
    installViewGestures({
      surface: surface.asElement(),
      canStart: () => true,
      claim: (kind) => {
        claims.push(kind)
        return false
      },
      begin: (intent) => intents.push(intent),
      minIntervalMs: 0,
    })
    surface.emit('pointerdown', pointer(1, 0, 0))
    surface.emit('pointermove', pointer(1, 100, 0))
    // 问过上层（它据此放弃点击），但被拒后不产生任何增量。
    expect(claims).toEqual(['rotate'])
    expect(intents).toHaveLength(0)
  })

  test('canStart 为 false 时完全不认领', () => {
    const { surface, kinds } = setup({ canStart: () => false })
    surface.emit('pointerdown', pointer(1, 0, 0))
    expect(kinds).toEqual([])
  })
})

describe('installViewGestures · 双指缩放与平移', () => {
  test('两指间距变化产生 zoom', () => {
    const { surface, intents } = setup()
    surface.emit('pointerdown', pointer(1, 100, 100))
    surface.emit('pointerdown', pointer(2, 200, 100))
    {
      // 间距 100 → 200：zoom 的 scale 应 > 1。
      surface.emit('pointermove', pointer(2, 300, 100))
    }
    expect(intents.some((intent) => intent.kind === 'zoom' && intent.scale > 1)).toBe(true)
  })

  test('中点位移产生 pan', () => {
    const { surface, intents } = setup()
    surface.emit('pointerdown', pointer(1, 100, 100))
    surface.emit('pointerdown', pointer(2, 200, 100))
    {
      // 两指同时右移 50：间距不变 → pan。
      surface.emit('pointermove', pointer(1, 150, 100))
      surface.emit('pointermove', pointer(2, 250, 100))
    }
    expect(intents.some((intent) => intent.kind === 'pan' && intent.dx > 0)).toBe(true)
  })

  test('canPan 为 false 时不产生 pan', () => {
    const { surface, intents } = setup({ canPan: () => false })
    surface.emit('pointerdown', pointer(1, 100, 100))
    surface.emit('pointerdown', pointer(2, 200, 100))
    {
      surface.emit('pointermove', pointer(1, 150, 100))
      surface.emit('pointermove', pointer(2, 250, 100))
    }
    expect(intents.some((intent) => intent.kind === 'pan')).toBe(false)
  })

  test('双指退回单指后不再用旧中点计算', () => {
    const { surface, intents, handle } = setup()
    surface.emit('pointerdown', pointer(1, 100, 100))
    surface.emit('pointerdown', pointer(2, 200, 100))
    surface.emit('pointerup', pointer(2, 200, 100))
    expect(handle.kind()).toBe('rotate')
    {
      // 手指没动：不应产生任何意图（若原点未重设，这里会跳一大段）。
      surface.emit('pointermove', pointer(1, 100, 100))
    }
    expect(intents).toHaveLength(0)
  })
})

describe('installViewGestures · 滚轮', () => {
  test('向下滚产生缩小（scale < 1）', () => {
    const { surface, intents } = setup()
    surface.emit('wheel', { pointerId: 0, clientX: 0, clientY: 0, deltaY: 100 })
    expect(intents).toHaveLength(1)
    expect(intents[0]!.kind).toBe('zoom')
    expect(intents[0]!.scale).toBeLessThan(1)
  })

  test('向上滚产生放大（scale > 1）', () => {
    const { surface, intents } = setup()
    surface.emit('wheel', { pointerId: 0, clientX: 0, clientY: 0, deltaY: -100 })
    expect(intents[0]!.scale).toBeGreaterThan(1)
  })

  test('触控板捏合（ctrlKey）的缩放幅度更大', () => {
    const plain = setup()
    plain.surface.emit('wheel', { pointerId: 0, clientX: 0, clientY: 0, deltaY: 50 })
    const pinch = setup()
    pinch.surface.emit('wheel', { pointerId: 0, clientX: 0, clientY: 0, deltaY: 50, ctrlKey: true })
    // 同样的 deltaY，捏合的偏离 1 更远（缩放更明显）。
    expect(Math.abs(1 - pinch.intents[0]!.scale)).toBeGreaterThan(Math.abs(1 - plain.intents[0]!.scale))
  })

  test('deltaY 为 0 时不产生意图', () => {
    const { surface, intents } = setup()
    surface.emit('wheel', { pointerId: 0, clientX: 0, clientY: 0, deltaY: 0 })
    expect(intents).toHaveLength(0)
  })
})

describe('installViewGestures · 生命周期', () => {
  test('dispose 后不再响应', () => {
    const { surface, intents, handle } = setup()
    handle.dispose()
    surface.emit('wheel', { pointerId: 0, clientX: 0, clientY: 0, deltaY: 100 })
    expect(intents).toHaveLength(0)
  })

  test('active() 反映手势状态', () => {
    const { surface, handle } = setup()
    expect(handle.active()).toBe(false)
    surface.emit('pointerdown', pointer(1, 0, 0))
    expect(handle.active()).toBe(true)
    surface.emit('pointerup', pointer(1, 0, 0))
    expect(handle.active()).toBe(false)
  })

  test('isSurface 为 false 的事件被忽略', () => {
    const { surface, kinds } = setup({ isSurface: () => false })
    surface.emit('pointerdown', pointer(1, 0, 0))
    expect(kinds).toEqual([])
  })

  test('五类监听都挂在 surface 上', () => {
    const surface = fakeSurface()
    installViewGestures({
      surface: surface.asElement(),
      canStart: () => true,
      claim: () => true,
      begin: () => undefined,
    })
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel']) {
      expect(surface.count(type)).toBe(1)
    }
  })
})
