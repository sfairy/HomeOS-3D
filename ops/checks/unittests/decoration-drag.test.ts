/**
 * 「我的装饰」拖到画布 / 点击放置的链路单测（0.8.9）。
 *
 * 上游两种放置方式并存，契约不同，混用会静默失败：
 *
 * - **拖拽**：MIME = `application/x-ha-bridge-3d-item`，有效负载 = **assetId**
 * - **资源库其它卡片**：MIME = `application/x-homeos-item`，有效负载 = **类型名**
 *
 * 两者都是裸字符串，只靠内容无法区分 —— 所以必须有独立的 MIME 分流。
 * 这里断言的就是这条分流不会被「顺手复用同一个通道」的改动破坏。
 */
import { describe, expect, test } from 'bun:test'

import {
  USER_DECORATION_DRAG_TYPE,
  hasDraggablePayload,
} from '../../../homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/interaction/drag-and-drop'

/** 造一个只带 `dataTransfer.types` 的最小拖拽事件。 */
function dragEvent(types: string[]): { dataTransfer: DataTransfer | null } {
  return { dataTransfer: { types } as unknown as DataTransfer }
}

describe('拖拽 MIME 契约', () => {
  test('与上游一致（x-ha-bridge-3d-item）', () => {
    expect(USER_DECORATION_DRAG_TYPE).toBe('application/x-ha-bridge-3d-item')
  })

  test('与资源库通道分开（不能复用 x-homeos-item）', () => {
    expect(USER_DECORATION_DRAG_TYPE).not.toBe('application/x-homeos-item')
  })
})

describe('hasDraggablePayload：画布是否接受这次拖拽', () => {
  test('装饰拖拽被接受', () => {
    expect(hasDraggablePayload(dragEvent([USER_DECORATION_DRAG_TYPE]))).toBe(true)
  })

  test('资源库类型名拖拽仍被接受（不能因为加了装饰而丢掉旧通道）', () => {
    expect(hasDraggablePayload(dragEvent(['application/x-homeos-item']))).toBe(true)
  })

  test('两种同时存在也被接受', () => {
    expect(hasDraggablePayload(dragEvent([USER_DECORATION_DRAG_TYPE, 'application/x-homeos-item']))).toBe(true)
  })

  test('无关拖拽（文件、文本）被拒绝', () => {
    expect(hasDraggablePayload(dragEvent(['Files']))).toBe(false)
    expect(hasDraggablePayload(dragEvent(['text/plain']))).toBe(false)
    expect(hasDraggablePayload(dragEvent([]))).toBe(false)
  })

  test('没有 dataTransfer 时不抛错（合成事件常见）', () => {
    expect(hasDraggablePayload({ dataTransfer: null })).toBe(false)
    expect(hasDraggablePayload({})).toBe(false)
  })
})
