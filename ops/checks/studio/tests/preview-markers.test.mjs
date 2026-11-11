import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  clampScreenPercent,
  handleMarkerActivate,
  isFixedPositionAlarm,
  modelBindingPosition,
  previewReferenceKey,
  previewSelectionOf,
  screenPointToFixedPercent,
} from '../../../../homeos/frontend/src/studio/runtime/core/stage/preview-markers.ts'

/**
 * 从 `stage.ts` 的 `mountStage` 闭包里外移出来的标记纯函数（第 13 节）。
 *
 * 这些函数此前只能通过真实 3D 舞台间接验证，搬迁时最容易改掉的是**模块归属链**与
 * 「绑定坐标还是模型坐标」的优先级。这里逐条钉住，改动即失败。
 */

describe('previewSelectionOf', () => {
  test('扫地机快捷指令用裸 shortcutId，并标成 vacuum-shortcut', () => {
    const selection = previewSelectionOf({
      deviceKind: 'vacuum-room',
      id: 'vacuum-room:v1:r1',
      shortcutId: 'r1',
      vacuumId: 'v1',
      floorId: 'f1',
    })
    expect(selection.id).toBe('r1')
    expect(selection.module).toBe('vacuum-shortcut')
    expect(selection.vacuumId).toBe('v1')
    expect(selection.floorId).toBe('f1')
  })

  test('优先 entryId，其次标记 id', () => {
    expect(previewSelectionOf({ deviceKind: 'light', id: 'm1', entryId: 'e1' }).id).toBe('e1')
    expect(previewSelectionOf({ deviceKind: 'light', id: 'm1' }).id).toBe('m1')
  })

  test('模块归属链：专用标志优先于 deviceKind', () => {
    const moduleOf = (extra) => previewSelectionOf({ id: 'm', deviceKind: 'switch', ...extra }).module
    expect(moduleOf({ waterHeater: true })).toBe('water-heater')
    expect(moduleOf({ airPurifier: true })).toBe('purifier')
    expect(moduleOf({ pedestalFan: true })).toBe('fan')
    expect(moduleOf({ airer: true })).toBe('airer')
    expect(moduleOf({ deviceKind: 'climate' })).toBe('climate')
  })

  test('没有 vacuumId 时不带该字段（避免编辑器读到 undefined）', () => {
    expect('vacuumId' in previewSelectionOf({ deviceKind: 'light', id: 'm' })).toBe(false)
  })
})

describe('previewReferenceKey', () => {
  test('键 = [模块归属, 标记 id]，专用标志与 selection 同口径', () => {
    expect(previewReferenceKey({ id: 'm1', deviceKind: 'light' })).toBe('["light","m1"]')
    expect(previewReferenceKey({ id: 'm2', deviceKind: 'switch', waterHeater: true })).toBe('["water-heater","m2"]')
    expect(previewReferenceKey({ id: 'm3', deviceKind: 'switch', airer: true })).toBe('["airer","m3"]')
  })
})

describe('modelBindingPosition', () => {
  test('绑定里写了有限数值就用绑定', () => {
    expect(modelBindingPosition({ x: 1.5, y: -2 }, { x: 9, y: 9 })).toEqual({ x: 1.5, y: -2 })
  })

  test('缺值或非有限数回落到模型位置', () => {
    expect(modelBindingPosition({}, { x: 3, y: 4 })).toEqual({ x: 3, y: 4 })
    expect(modelBindingPosition({ x: Number.NaN, y: '5' }, { x: 3, y: 4 })).toEqual({ x: 3, y: 4 })
  })

  test('模型也没有时落 0（不是 null，标记不能没有坐标）', () => {
    expect(modelBindingPosition({}, undefined)).toEqual({ x: 0, y: 0 })
  })
})

describe('clampScreenPercent', () => {
  test('夹到 0–100，接受数字字符串', () => {
    expect(clampScreenPercent('42.5')).toBe(42.5)
    expect(clampScreenPercent(200)).toBe(100)
    expect(clampScreenPercent(-5)).toBe(0)
  })

  test('非有限数落回 50（居中），不是 0', () => {
    expect(clampScreenPercent(Number.NaN)).toBe(50)
    expect(clampScreenPercent('abc')).toBe(50)
    expect(clampScreenPercent(undefined)).toBe(50)
  })
})

describe('screenPointToFixedPercent', () => {
  const rect = (left, top, width, height) => ({ left, top, width, height })

  test('按舞台矩形换算成画面百分比', () => {
    const stage = { getBoundingClientRect: () => rect(100, 50, 1000, 500) }
    expect(screenPointToFixedPercent({ clientX: 600, clientY: 300 }, stage)).toEqual({ x: 50, y: 50 })
  })

  test('舞台尺寸为 0 时返回 null（由调用方跳过定位）', () => {
    const stage = { getBoundingClientRect: () => rect(0, 0, 0, 0) }
    expect(screenPointToFixedPercent({ clientX: 10, clientY: 10 }, stage)).toBeNull()
  })
})

describe('isFixedPositionAlarm', () => {
  test('只有「安防告警 + fixed」才算固定位置', () => {
    expect(isFixedPositionAlarm({ securityAlarm: true, positionMode: 'fixed' })).toBe(true)
    expect(isFixedPositionAlarm({ securityAlarm: true, positionMode: 'floor' })).toBe(false)
    expect(isFixedPositionAlarm({ positionMode: 'fixed' })).toBe(false)
    expect(isFixedPositionAlarm(null)).toBe(false)
  })
})

describe('handleMarkerActivate', () => {
  const posted = []
  const originalWindow = globalThis.window
  const originalLocation = globalThis.location

  beforeEach(() => {
    posted.length = 0
    globalThis.location = { origin: 'http://127.0.0.1' }
    globalThis.window = { parent: { postMessage: (message) => posted.push(message) } }
  })

  afterEach(() => {
    globalThis.window = originalWindow
    globalThis.location = originalLocation
  })

  const readyCtx = () => ({
    isEditing: false,
    isControlReady: true,
    focusedItemId: 'm1',
    panelDisplayMode: 'panel',
    followVacuumId: null,
  })

  test('摄像头：已聚焦且控制就绪时开宿主弹窗', () => {
    handleMarkerActivate({ id: 'm1', deviceKind: 'camera', entityId: 'camera.front' }, readyCtx())
    expect(posted).toEqual([{ channel: 'hb-i3d-v1', type: 'camera-popup', id: 'm1' }])
  })

  test('摄像头：正在编辑时不抢弹窗', () => {
    handleMarkerActivate(
      { id: 'm1', deviceKind: 'camera', entityId: 'camera.front' },
      { ...readyCtx(), isEditing: true },
    )
    expect(posted).toEqual([])
  })

  test('扫地机：未跟随、已聚焦、面板模式下开弹窗', () => {
    handleMarkerActivate({ id: 'm1', deviceKind: 'vacuum', entityId: 'vacuum.robot' }, readyCtx())
    expect(posted).toEqual([{ channel: 'hb-i3d-v1', type: 'vacuum-popup', id: 'm1' }])
  })

  test('扫地机：正在跟随时不弹（跟随机位优先）', () => {
    handleMarkerActivate(
      { id: 'm1', deviceKind: 'vacuum', entityId: 'vacuum.robot' },
      { ...readyCtx(), followVacuumId: 'vacuum.robot' },
    )
    expect(posted).toEqual([])
  })

  test('未聚焦的标记只交给面板，不发宿主消息', () => {
    const ctx = { ...readyCtx(), focusedItemId: 'other' }
    handleMarkerActivate({ id: 'm1', deviceKind: 'camera', entityId: 'camera.front' }, ctx)
    handleMarkerActivate({ id: 'm1', deviceKind: 'vacuum', entityId: 'vacuum.robot' }, ctx)
    expect(posted).toEqual([])
  })
})
