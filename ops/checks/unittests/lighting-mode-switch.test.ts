/**
 * 光影模式切换的单测（0.8.9「标准光影 / 轻量柔光」）。
 *
 * 这一块的错误都表现为「看着切了、画面没变」，所以断言集中在**顺序与副作用**：
 *
 * - 先写 `previewLightingMode` 再换管线 —— 反了的话新灯光会注册到马上被销毁的控制器上；
 * - 管线切换必须发生（否则两条管线互斥的前提被破坏，会双倍亮度）；
 * - 灯光层与建筑层都要重建（受光面材质被换过）。
 */
import { describe, expect, test } from 'bun:test'

import {
  applyPreviewLightingMode,
  readDraftLightingMode,
} from '../../../homeos/frontend/src/studio/authoring/ui/lighting'

type Call = { name: string; args?: unknown }

function fakeRuntime(overrides: Record<string, unknown> = {}) {
  const calls: Call[] = []
  const appCtx = {
    studioState: { settings: { lightingMode: 'standard', lightingModeVersion: 2 } },
    previewLightingMode: 'standard' as 'standard' | 'region',
    applyLightingPipeline: (mode: string) => {
      calls.push({ name: 'pipeline', args: mode })
      // 记录切换管线那一刻 previewLightingMode 已经是新值（顺序断言用）。
      calls.push({ name: 'pipeline-saw', args: appCtx.previewLightingMode })
    },
    ...overrides,
  }
  const runtime = {
    appCtx,
    requestSceneRebuild: (options: Record<string, unknown>) => calls.push({ name: 'rebuild', args: options.scope }),
    markDocumentDirty: () => calls.push({ name: 'dirty' }),
    ...overrides,
  }
  return { runtime, appCtx, calls }
}

describe('读取草稿模式', () => {
  test('region 原样返回', () => {
    const { runtime } = fakeRuntime()
    runtime.appCtx.studioState.settings.lightingMode = 'region'
    expect(readDraftLightingMode(runtime)).toBe('region')
  })

  test('缺失 / 非法值回落标准光影', () => {
    const { runtime } = fakeRuntime()
    runtime.appCtx.studioState.settings.lightingMode = 'nope'
    expect(readDraftLightingMode(runtime)).toBe('standard')
    expect(readDraftLightingMode({ appCtx: { studioState: {} } })).toBe('standard')
  })
})

describe('切换模式', () => {
  test('先写模式字段再换管线', () => {
    const { runtime, calls } = fakeRuntime()
    applyPreviewLightingMode(runtime, 'region')
    const pipelineIndex = calls.findIndex((call) => call.name === 'pipeline')
    const sawIndex = calls.findIndex((call) => call.name === 'pipeline-saw')
    expect(pipelineIndex).toBeGreaterThanOrEqual(0)
    // 换管线时读到的已经是新值。
    expect(calls[sawIndex]?.args).toBe('region')
  })

  test('写回草稿并带上版本号', () => {
    const { runtime, appCtx } = fakeRuntime()
    applyPreviewLightingMode(runtime, 'region')
    expect(appCtx.studioState.settings.lightingMode).toBe('region')
    expect(appCtx.studioState.settings.lightingModeVersion).toBe(2)
  })

  test('整场景强制重建一次（灯光要重新注册、材质被换过）', () => {
    const { runtime, calls } = fakeRuntime()
    applyPreviewLightingMode(runtime, 'region')
    const rebuilds = calls.filter((call) => call.name === 'rebuild')
    expect(rebuilds.length).toBe(1)
  })

  test('标脏（切换属于文档改动）', () => {
    const { runtime, calls } = fakeRuntime()
    applyPreviewLightingMode(runtime, 'region')
    expect(calls.some((call) => call.name === 'dirty')).toBe(true)
  })

  test('切回标准光影同样生效（不是单向开关）', () => {
    const { runtime, appCtx } = fakeRuntime()
    applyPreviewLightingMode(runtime, 'region')
    applyPreviewLightingMode(runtime, 'standard')
    expect(appCtx.previewLightingMode).toBe('standard')
    expect(appCtx.studioState.settings.lightingMode).toBe('standard')
  })

  test('没有管线实现时也不抛错（嵌入舞台固定管线）', () => {
    const { runtime } = fakeRuntime()
    runtime.appCtx.applyLightingPipeline = null
    expect(() => applyPreviewLightingMode(runtime, 'region')).not.toThrow()
  })

  test('重复切到同一模式：不再重建（上游 `target === be` 直接返回）', () => {
    const { runtime, calls } = fakeRuntime()
    applyPreviewLightingMode(runtime, 'region')
    const rebuildsAfterFirst = calls.filter((call) => call.name === 'rebuild').length
    applyPreviewLightingMode(runtime, 'region')
    expect(calls.filter((call) => call.name === 'rebuild').length).toBe(rebuildsAfterFirst)
  })

  test('换管线失败要回滚整条管线（不是只改按钮）', () => {
    const { runtime, appCtx, calls } = fakeRuntime()
    let failedOnce = false
    appCtx.applyLightingPipeline = (mode: string) => {
      calls.push({ name: 'pipeline', args: mode })
      if (mode === 'region' && !failedOnce) {
        failedOnce = true
        throw new Error('管线创建失败')
      }
    }
    expect(() => applyPreviewLightingMode(runtime, 'region')).toThrow('管线创建失败')
    // 回滚到标准光影：草稿、管线标志、管线本身三处都要回去。
    expect(appCtx.previewLightingMode).toBe('standard')
    expect(appCtx.studioState.settings.lightingMode).toBe('standard')
    expect(calls.filter((call) => call.name === 'pipeline').map((call) => call.args)).toEqual(['region', 'standard'])
    // 回滚同样要重建：抛错发生在换管线那一步，正常路径的第一次重建还没排上，
    // 所以总重建次数是 1（回滚那一次）。
    expect(calls.filter((call) => call.name === 'rebuild').length).toBe(1)
  })
})
