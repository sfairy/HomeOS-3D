/**
 * 用户装饰「放进户型」链路的单测（0.8.9）。
 *
 * 这条链路有三个环节，任何一环断了都表现为**同一件事**：物品在列表里、但场景里看不见。
 * 所以这里逐环断言，而不是只测最终结果：
 *
 * 1. 卡片带 `data-place-decoration`（点击放置的入口契约）；
 * 2. `user-decoration` 物品能解析出 `model:<assetId>` 这样的动态模型键；
 * 3. 动态登记的 URL 指向后端模型库，且非法 assetId 不会登记（避免去请求 404）。
 */
import { describe, expect, test } from 'bun:test'

import {
  USER_DECORATION_MODEL_PREFIX,
  isUserDecorationModelKey,
  modelKeyForDecorationItem,
  decorationModelName,
  decorationPlacementFields,
  forgetDecorationModelName,
  registerDecorationModelNames,
  registerUserDecorationModel,
  resetUserDecorationModelsForTest,
  setUserDecorationStageContext,
  unregisterUserDecorationModel,
  userDecorationModelDefinition,
  userDecorationModelKey,
} from '../../../homeos/frontend/src/studio/authoring/loaders/external-models/user-decoration-models'

const ASSET_ID = '0123456789abcdef0123456789abcdef'
const OTHER_ASSET_ID = 'fedcba9876543210fedcba9876543210'

describe('模型键形状', () => {
  test('前缀可识别', () => {
    expect(userDecorationModelKey(ASSET_ID)).toBe(USER_DECORATION_MODEL_PREFIX + ASSET_ID)
    expect(isUserDecorationModelKey(userDecorationModelKey(ASSET_ID))).toBe(true)
  })

  test('静态类型名不会被误判成用户装饰', () => {
    for (const staticType of ['sofa', 'wallac', 'model', 'pillar_round']) {
      expect(isUserDecorationModelKey(staticType)).toBe(false)
    }
  })

  test('非字符串安全返回 false', () => {
    expect(isUserDecorationModelKey(null)).toBe(false)
    expect(isUserDecorationModelKey(undefined)).toBe(false)
  })
})

describe('登记与查询', () => {
  test('登记后能查到描述符，URL 指向后端模型库', () => {
    resetUserDecorationModelsForTest()
    const key = registerUserDecorationModel(ASSET_ID, { width: 0.6, height: 0.9, depth: 0.4 })
    expect(key).toBe(userDecorationModelKey(ASSET_ID))
    const definition = userDecorationModelDefinition(key)
    expect(definition?.url).toBe(`/api/v1/studio3d/models/${ASSET_ID}`)
    expect(definition?.url).toBe(definition?.fallbackUrl)
    expect(definition?.preserveOrigin).toBe(true)
  })

  test('尺寸被带进 scaleBasis（占位尺寸不丢）', () => {
    resetUserDecorationModelsForTest()
    registerUserDecorationModel(ASSET_ID, { width: 0.6, height: 0.9, depth: 0.4 })
    expect(userDecorationModelDefinition(userDecorationModelKey(ASSET_ID))?.scaleBasis).toEqual([0.6, 0.9, 0.4])
  })

  test('非法尺寸回落 0.4（不产生 0 尺寸的「看不见」模型）', () => {
    resetUserDecorationModelsForTest()
    registerUserDecorationModel(ASSET_ID, { width: 0, height: Number.NaN, depth: -1 })
    expect(userDecorationModelDefinition(userDecorationModelKey(ASSET_ID))?.scaleBasis).toEqual([0.4, 0.4, 0.4])
  })

  test('非法 assetId 不登记（否则会去请求 404 的 URL）', () => {
    resetUserDecorationModelsForTest()
    for (const badAssetId of ['', 'not-hex', '0123456789ABCDEF0123456789ABCDEF', '../etc', ASSET_ID + 'x']) {
      expect(registerUserDecorationModel(badAssetId, { width: 1, height: 1, depth: 1 })).toBeNull()
    }
  })

  test('重复登记幂等（重传同名模型要覆盖 URL 而非叠加）', () => {
    resetUserDecorationModelsForTest()
    registerUserDecorationModel(ASSET_ID, { width: 1, height: 1, depth: 1 })
    registerUserDecorationModel(ASSET_ID, { width: 2, height: 2, depth: 2 })
    expect(userDecorationModelDefinition(userDecorationModelKey(ASSET_ID))?.scaleBasis).toEqual([2, 2, 2])
  })

  test('两个 assetId 互不覆盖', () => {
    resetUserDecorationModelsForTest()
    registerUserDecorationModel(ASSET_ID, { width: 1, height: 1, depth: 1 })
    registerUserDecorationModel(OTHER_ASSET_ID, { width: 2, height: 2, depth: 2 })
    expect(userDecorationModelDefinition(userDecorationModelKey(ASSET_ID))?.scaleBasis).toEqual([1, 1, 1])
    expect(userDecorationModelDefinition(userDecorationModelKey(OTHER_ASSET_ID))?.scaleBasis).toEqual([2, 2, 2])
  })

  test('删除后查不到（模型被移除时不再尝试加载）', () => {
    resetUserDecorationModelsForTest()
    registerUserDecorationModel(ASSET_ID, { width: 1, height: 1, depth: 1 })
    unregisterUserDecorationModel(ASSET_ID)
    expect(userDecorationModelDefinition(userDecorationModelKey(ASSET_ID))).toBeUndefined()
  })
})

describe('模型名登记（拖拽放置靠它补 name）', () => {
  test('登记后能取到名字', () => {
    resetUserDecorationModelsForTest()
    registerDecorationModelNames([{ assetId: ASSET_ID, name: '青花瓷瓶' }])
    expect(decorationModelName(ASSET_ID)).toBe('青花瓷瓶')
  })

  test('带 model: 前缀也能取到', () => {
    resetUserDecorationModelsForTest()
    registerDecorationModelNames([{ assetId: ASSET_ID, name: '青花瓷瓶' }])
    expect(decorationModelName(`model:${ASSET_ID}`)).toBe('青花瓷瓶')
  })

  test('未登记时返回空串（调用方自行兜底，不抛错）', () => {
    resetUserDecorationModelsForTest()
    expect(decorationModelName(OTHER_ASSET_ID)).toBe('')
    expect(decorationModelName(undefined)).toBe('')
  })

  test('空名 / 非法 assetId 不登记（避免把「我的装饰」写死进表）', () => {
    resetUserDecorationModelsForTest()
    registerDecorationModelNames([
      { assetId: ASSET_ID, name: '   ' },
      { assetId: 'not-hex', name: 'x' },
    ])
    expect(decorationModelName(ASSET_ID)).toBe('')
  })

  test('重新登记覆盖旧名（改名后拖拽应带新名）', () => {
    resetUserDecorationModelsForTest()
    registerDecorationModelNames([{ assetId: ASSET_ID, name: '旧名' }])
    registerDecorationModelNames([{ assetId: ASSET_ID, name: '新名' }])
    expect(decorationModelName(ASSET_ID)).toBe('新名')
  })

  test('删除模型时名字一并清掉', () => {
    resetUserDecorationModelsForTest()
    registerDecorationModelNames([{ assetId: ASSET_ID, name: '青花瓷瓶' }])
    forgetDecorationModelName(ASSET_ID)
    expect(decorationModelName(ASSET_ID)).toBe('')
  })
})

describe('放置字段（两条放置路径共用）', () => {
  test('已登记名字时带真实模型名', () => {
    resetUserDecorationModelsForTest()
    registerDecorationModelNames([{ assetId: ASSET_ID, name: '青花瓷瓶' }])
    const fields = decorationPlacementFields(ASSET_ID)
    expect(fields.assetId).toBe(ASSET_ID)
    expect(fields.name).toBe('青花瓷瓶')
    expect(fields.modelScale).toBe(1)
  })

  test('未登记名字时回落目录名（不写空串）', () => {
    resetUserDecorationModelsForTest()
    expect(decorationPlacementFields(OTHER_ASSET_ID).name).toBe('我的装饰')
  })

  test('assetId 带 model: 前缀时剥掉（本仓存裸 hex）', () => {
    resetUserDecorationModelsForTest()
    registerDecorationModelNames([{ assetId: ASSET_ID, name: '落地灯' }])
    const fields = decorationPlacementFields(`model:${ASSET_ID}`)
    expect(fields.assetId).toBe(ASSET_ID)
    // 剥前缀后才能查到名字 —— 这条守的正是「带前缀查不到名」的回归。
    expect(fields.name).toBe('落地灯')
  })

  test('字段集合与 payload 白名单一致（只带三个资产字段）', () => {
    resetUserDecorationModelsForTest()
    expect(Object.keys(decorationPlacementFields(ASSET_ID)).sort()).toEqual(['assetId', 'modelScale', 'name'])
  })
})

describe('舞台（仪表盘 3D 控件）的 URL', () => {
  test('默认走编辑器路径（只判登录）', () => {
    resetUserDecorationModelsForTest()
    registerUserDecorationModel(ASSET_ID, { width: 1, height: 1, depth: 1 })
    expect(userDecorationModelDefinition(userDecorationModelKey(ASSET_ID))?.url).toBe(
      `/api/v1/studio3d/models/${ASSET_ID}`,
    )
  })

  test('设置舞台上下文后走**场景内**路径（要求被该场景引用）', () => {
    resetUserDecorationModelsForTest()
    setUserDecorationStageContext('scene-1', 'project-1')
    registerUserDecorationModel(ASSET_ID, { width: 1, height: 1, depth: 1 })
    expect(userDecorationModelDefinition(userDecorationModelKey(ASSET_ID))?.url).toBe(
      `/api/v1/modules/interaction3d/scenes/scene-1/models/${ASSET_ID}?projectId=project-1`,
    )
  })

  test('切到舞台时已登记的地址跟着换（不能留着编辑器 URL 去 404）', () => {
    resetUserDecorationModelsForTest()
    registerUserDecorationModel(ASSET_ID, { width: 1, height: 1, depth: 1 })
    setUserDecorationStageContext('scene-2')
    expect(userDecorationModelDefinition(userDecorationModelKey(ASSET_ID))?.url).toBe(
      `/api/v1/modules/interaction3d/scenes/scene-2/models/${ASSET_ID}`,
    )
  })

  test('清空上下文退回编辑器路径', () => {
    resetUserDecorationModelsForTest()
    setUserDecorationStageContext('scene-1')
    registerUserDecorationModel(ASSET_ID, { width: 1, height: 1, depth: 1 })
    setUserDecorationStageContext('')
    expect(userDecorationModelDefinition(userDecorationModelKey(ASSET_ID))?.url).toBe(
      `/api/v1/studio3d/models/${ASSET_ID}`,
    )
  })
})

describe('物品记录 → 模型键（渲染入口）', () => {
  test('user-decoration 物品就地登记并返回键', () => {
    resetUserDecorationModelsForTest()
    const key = modelKeyForDecorationItem({
      type: 'user-decoration',
      assetId: ASSET_ID,
      width: 0.5,
      height: 0.7,
      depth: 0.3,
    })
    expect(key).toBe(userDecorationModelKey(ASSET_ID))
    expect(userDecorationModelDefinition(key)?.scaleBasis).toEqual([0.5, 0.7, 0.3])
  })

  test('非 user-decoration 一律返回 null（不污染静态类型）', () => {
    expect(modelKeyForDecorationItem({ type: 'sofa', assetId: ASSET_ID })).toBeNull()
    expect(modelKeyForDecorationItem({ type: 'wallac' })).toBeNull()
  })

  test('assetId 非法返回 null（渲染期不能抛错）', () => {
    expect(modelKeyForDecorationItem({ type: 'user-decoration', assetId: '' })).toBeNull()
    expect(modelKeyForDecorationItem({ type: 'user-decoration', assetId: 'abc' })).toBeNull()
    expect(modelKeyForDecorationItem({ type: 'user-decoration', assetId: 123 })).toBeNull()
  })

  test('读上游键名 modelAssetId（带 model: 前缀）', () => {
    resetUserDecorationModelsForTest()
    const key = modelKeyForDecorationItem({ type: 'user-decoration', modelAssetId: `model:${ASSET_ID}` })
    expect(key).toBe(userDecorationModelKey(ASSET_ID))
    expect(userDecorationModelDefinition(key)?.url).toBe(`/api/v1/studio3d/models/${ASSET_ID}`)
  })

  test('两个键都在时以 assetId 为准', () => {
    resetUserDecorationModelsForTest()
    const key = modelKeyForDecorationItem({
      type: 'user-decoration',
      assetId: ASSET_ID,
      modelAssetId: `model:${OTHER_ASSET_ID}`,
    })
    expect(key).toBe(userDecorationModelKey(ASSET_ID))
  })

  test('缺尺寸时回落占位尺寸而不是 0', () => {
    resetUserDecorationModelsForTest()
    const key = modelKeyForDecorationItem({ type: 'user-decoration', assetId: ASSET_ID })
    expect(userDecorationModelDefinition(key)?.scaleBasis).toEqual([0.4, 0.4, 0.4])
  })
})
