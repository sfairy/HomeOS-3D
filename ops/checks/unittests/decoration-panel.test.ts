/**
 * 「我的装饰」面板与拖拽槽位的单测（0.8.9）。
 *
 * 面板本身要 DOM，这里只测**能脱离 DOM 断言的口径**：额度文案、上传是否被挡、体积展示。
 * 这几处错了不会报错，只会让用户看到「按钮永远是灰的」或「明明还有额度却传不上去」。
 */
import { describe, expect, test } from 'bun:test'

import {
  decorationSizeLabel,
  decorationStatusText,
  decorationUploadBlocked,
} from '../../../homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/ui/decoration-library'

import type {
  DecorationLibraryState,
  DecorationModel,
} from '../../../homeos/frontend/src/studio/app/3d-studio/authoring/items/studio-user-decorations'

function library(overrides: Partial<DecorationLibraryState> = {}): DecorationLibraryState {
  return {
    models: [],
    totalBytes: 0,
    maxBytes: 128 * 1024 * 1024,
    maxModels: 240,
    maxUploadBytes: 12 * 1024 * 1024,
    uploadLimits: {
      triangles: 60000,
      meshParts: 4096,
      nodes: 2048,
      images: 32,
      imageSide: 2048,
      imagePixels: 16777216,
    },
    ...overrides,
  }
}

function model(assetId: string, name = '沙发摆件'): DecorationModel {
  return { assetId, name, bytes: 1024 * 1024, createdAt: 0, builtin: false }
}

describe('体积展示', () => {
  test('小于 1 MiB 用 KB（且至少 1）', () => {
    expect(decorationSizeLabel(0)).toBe('—')
    expect(decorationSizeLabel(512)).toBe('1 KB')
    expect(decorationSizeLabel(300 * 1024)).toBe('300 KB')
  })

  test('MiB 以上保留一位小数', () => {
    expect(decorationSizeLabel(2.5 * 1024 * 1024)).toBe('2.5 MB')
  })

  test('非法值退化成占位而不是 NaN', () => {
    expect(decorationSizeLabel(Number.NaN)).toBe('—')
    expect(decorationSizeLabel(-1)).toBe('—')
  })
})

describe('状态行', () => {
  test('空库给引导文案（上游原文）', () => {
    expect(decorationStatusText(library({ models: [] }))).toBe('上传一个 GLB 后，即可将它放入户型。')
  })

  test('有条目时状态行为空（上游不常驻计数器）', () => {
    // 列表本身就是计数；再顶一行「已上传 N/M 件」会把首屏卡片挤下去。
    expect(decorationStatusText(library({ models: [model('a')] }))).toBe('')
  })

  test('不报精确字节（额度信息属于上传说明弹窗）', () => {
    const text = decorationStatusText(library({ models: [model('a')], totalBytes: 1234567 }))
    expect(text).not.toContain('1234567')
    expect(text).not.toContain('占用')
  })
})

describe('上传额度', () => {
  test('未满可传', () => {
    expect(decorationUploadBlocked(library({ models: [model('a')], maxModels: 2 }))).toBe(false)
  })

  test('满额被挡', () => {
    expect(decorationUploadBlocked(library({ models: [model('a'), model('b')], maxModels: 2 }))).toBe(true)
  })

  test('上限为 0 视为不限（不是「永远满」）', () => {
    expect(decorationUploadBlocked(library({ maxModels: 0, models: [model('a')] }))).toBe(false)
  })
})
