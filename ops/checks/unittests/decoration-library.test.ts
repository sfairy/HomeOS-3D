/**
 * 装饰库客户端的单测（0.8.9）。
 *
 * 这一块的错误**不会抛异常**，只会安静地表现成「列表里少一条 / 图片裂开 / 传不上去」。
 * 所以断言的是口径：坏条目被丢弃、上限来自服务端、URL 带指纹、错误按码分派。
 */
import { describe, expect, test } from 'bun:test'

import {
  DECORATION_MODELS_PATH,
  decorationErrorMessage,
  decorationModelUrl,
  decorationSceneModelUrl,
  decorationToItem,
  decorationUploadIssue,
  normalizeDecorationLibrary,
} from '../../../homeos/frontend/src/studio/authoring/items/studio-user-decorations'

const ID_A = '0123456789abcdef0123456789abcdef'
const ID_B = 'fedcba9876543210fedcba9876543210'

describe('装饰库归一化', () => {
  test('接受合法条目并按名称排序（上游 localeCompare）', () => {
    const state = normalizeDecorationLibrary({
      models: [
        { assetId: ID_A, name: '旧', bytes: 10, createdAt: 1 },
        { assetId: ID_B, name: '新', bytes: 20, createdAt: 9 },
      ],
      totalBytes: 30,
      maxBytes: 100,
      maxModels: 5,
    })
    // 「新」在中文排序里靠后，与「上传时间倒序」的结果不同 —— 这条断言能区分两种排序。
    expect(state.models.map((model) => model.name)).toEqual(['旧', '新'])
    expect(state.totalBytes).toBe(30)
  })

  test('同名时按创建时间倒序（保证顺序稳定，卡片不跳动）', () => {
    const state = normalizeDecorationLibrary({
      models: [
        { assetId: ID_A, name: '同名', bytes: 10, createdAt: 1 },
        { assetId: ID_B, name: '同名', bytes: 20, createdAt: 9 },
      ],
    })
    expect(state.models.map((model) => model.assetId)).toEqual([ID_B, ID_A])
  })

  test('丢弃非法 assetId（否则会变成永远下载不到的幽灵装饰）', () => {
    const state = normalizeDecorationLibrary({ models: [{ assetId: 'not-hex', name: 'x' }, { assetId: ID_A }] })
    expect(state.models).toHaveLength(1)
    expect(state.models[0]!.assetId).toBe(ID_A)
  })

  test('重复 id 只留一条', () => {
    const state = normalizeDecorationLibrary({ models: [{ assetId: ID_A }, { assetId: ID_A }] })
    expect(state.models).toHaveLength(1)
  })

  test('空名回落到「我的装饰」', () => {
    const state = normalizeDecorationLibrary({ models: [{ assetId: ID_A, name: '  ' }] })
    expect(state.models[0]!.name).toBe('我的装饰')
  })

  test('展示名截断到 64', () => {
    const state = normalizeDecorationLibrary({ models: [{ assetId: ID_A, name: '名'.repeat(200) }] })
    expect(state.models[0]!.name).toHaveLength(64)
  })

  test('缺 totalBytes 时按条目求和', () => {
    const state = normalizeDecorationLibrary({ models: [{ assetId: ID_A, bytes: 7 }] })
    expect(state.totalBytes).toBe(7)
  })

  test('坏输入得到空库而不是抛错', () => {
    expect(normalizeDecorationLibrary(null).models).toEqual([])
    expect(normalizeDecorationLibrary('nope').maxBytes).toBe(0)
  })
})

describe('assetId 前缀兼容（0.8.9 上游带 model:）', () => {
  test('带前缀的条目被接受并归一化为裸 hex', () => {
    const state = normalizeDecorationLibrary({
      items: [{ assetId: 'model:' + ID_A, name: '花瓶', bytes: 10, createdAt: 1 }],
    })
    expect(state.models).toHaveLength(1)
    expect(state.models[0]!.assetId).toBe(ID_A)
  })

  test('裸 hex 与带前缀混排都能读（迁移期）', () => {
    const state = normalizeDecorationLibrary({
      models: [
        { assetId: ID_A, name: 'a', bytes: 1, createdAt: 1 },
        { assetId: 'model:' + ID_B, name: 'b', bytes: 1, createdAt: 2 },
      ],
    })
    expect(state.models.map((model) => model.assetId).sort()).toEqual([ID_A, ID_B].sort())
  })

  test('前缀大小写不敏感', () => {
    const state = normalizeDecorationLibrary({
      items: [{ assetId: 'MODEL:' + ID_A.toUpperCase(), name: 'x', bytes: 1, createdAt: 1 }],
    })
    expect(state.models[0]!.assetId).toBe(ID_A)
  })

  test('剥前缀后仍非法的一律丢弃', () => {
    const state = normalizeDecorationLibrary({
      items: [
        { assetId: 'model:not-hex', name: 'x' },
        { assetId: 'model:', name: 'y' },
      ],
    })
    expect(state.models).toHaveLength(0)
  })
})

describe('装饰上传校验', () => {
  const limits = { maxBytes: 12 * 1024 * 1024, maxModels: 240, modelCount: 0 }

  test('非 GLB 拒绝', () => {
    expect(decorationUploadIssue({ name: 'a.png', size: 10 }, limits)).toContain('.glb')
  })

  test('空文件拒绝', () => {
    expect(decorationUploadIssue({ name: 'a.glb', size: 0 }, limits)).toContain('文件为空')
  })

  test('超过体积上限时给出 MiB 数字', () => {
    const issue = decorationUploadIssue({ name: 'a.glb', size: 20 * 1024 * 1024 }, limits)
    expect(issue).toContain('12 MiB')
  })

  test('达到数量上限时拒绝', () => {
    expect(decorationUploadIssue({ name: 'a.glb', size: 10 }, { ...limits, modelCount: 240 })).toContain('上限')
  })

  test('合法文件放行', () => {
    expect(decorationUploadIssue({ name: 'a.glb', size: 10 }, limits)).toBeNull()
  })

  test('上限为 0 表示服务端没给（不拦截，交给后端判定）', () => {
    expect(decorationUploadIssue({ name: 'a.glb', size: 10 }, { maxBytes: 0, maxModels: 0 })).toBeNull()
  })
})

describe('装饰 URL', () => {
  test('编辑器预览地址', () => {
    expect(decorationModelUrl(ID_A)).toBe(`${DECORATION_MODELS_PATH}/${ID_A}`)
  })

  test('3D 舞台地址带 projectId', () => {
    expect(decorationSceneModelUrl('scene1', ID_A, 'p1')).toBe(
      `/api/v1/modules/interaction3d/scenes/scene1/models/${ID_A}?projectId=p1`,
    )
  })

  test('不带 projectId 时不拼查询串', () => {
    expect(decorationSceneModelUrl('scene1', ID_A)).not.toContain('?')
  })
})

describe('错误文案', () => {
  test('优先用后端 message', () => {
    expect(decorationErrorMessage({ response: { data: { message: '太大了' } } })).toBe('太大了')
  })

  test('回落到 detail', () => {
    expect(decorationErrorMessage({ response: { data: { detail: '细节' } } })).toBe('细节')
  })

  test('再回落到 Error.message', () => {
    expect(decorationErrorMessage(new Error('网络错误'))).toBe('网络错误')
  })

  test('都没有时用兜底文案', () => {
    expect(decorationErrorMessage({}, '兜底')).toBe('兜底')
  })
})

describe('装饰 → 物品', () => {
  test('带上 assetId / 名称 / 默认占位尺寸', () => {
    const item = decorationToItem({ assetId: ID_A, name: '花瓶', bytes: 1, createdAt: 1, builtin: false }, 'deco-1')
    expect(item.type).toBe('user-decoration')
    expect(item.assetId).toBe(ID_A)
    expect(item.name).toBe('花瓶')
    // 尺寸不能是 0：0 尺寸的物体会以「看不见」的形式出现在场景里。
    expect(Number(item.width)).toBeGreaterThan(0)
    expect(Number(item.depth)).toBeGreaterThan(0)
    expect(Number(item.height)).toBeGreaterThan(0)
  })
})
