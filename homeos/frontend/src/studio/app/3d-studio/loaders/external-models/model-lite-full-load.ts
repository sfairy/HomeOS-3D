/**
 * Q03：按 preferFull 选择 lite/full URL 并加载纹理（从 studio-external-models 拆出）。
 */

import { resolveModelLoadTarget, type ModelVariant } from './model-variant-upgrade'

type PreviewIssueInput = {
  stage: 'load' | 'parse' | 'fallback' | 'render'
  itemType: string
  url?: string
  status?: number
  message: string
}

type LoadedModelAsset = Record<string, unknown>

type LoadHelpers = {
  assetLoader: { loadAsync: (url: string) => Promise<unknown> }
  prepareModelTextures: (asset: LoadedModelAsset) => Promise<void>
  assertScene: (asset: unknown, url: string) => LoadedModelAsset
  reportPreviewIssue: (issue: PreviewIssueInput) => unknown
  statusOfPreviewError: (error: unknown) => number | undefined
  messageOfPreviewError: (error: unknown) => string
  isDisposed: () => boolean
}

/** 主 URL 加载；lite 失败且允许时回退 fallbackUrl。 */ export async function loadModelLiteOrFull(params: {
  itemDefinition: { url?: string; fallbackUrl?: string }
  itemTypeName: string
  preferFull: boolean
  templateCacheKey: string
  helpers: LoadHelpers
}): Promise<{ asset: LoadedModelAsset; loadedVariant: ModelVariant; preparedCacheKey: string | null }> {
  const { itemDefinition, itemTypeName, preferFull, templateCacheKey, helpers } = params
  const { primaryUrl, primaryVariant, cachePrepared } = resolveModelLoadTarget(itemDefinition, preferFull)
  try {
    const loadedAsset = helpers.assertScene(await helpers.assetLoader.loadAsync(primaryUrl), primaryUrl)
    await helpers.prepareModelTextures(loadedAsset)
    return {
      asset: loadedAsset,
      loadedVariant: primaryVariant,
      preparedCacheKey: cachePrepared ? templateCacheKey : null,
    }
  } catch (primaryLoadError: unknown) {
    // 备用 URL 与主 URL 相同时**不再重试**。
    //
    // 用户装饰（`model:<assetId>`）的两个 URL 是同一个下载地址：没有 lite/full 两份字节，
    // 重试只会在同一份 404 上再打一次请求，日志里还会多出一条误导性的
    // 「主资源与备用资源都失败」—— 看起来像两套资源都坏了，实际只有一个地址。
    if (
      helpers.isDisposed() ||
      !itemDefinition.fallbackUrl ||
      itemDefinition.fallbackUrl === primaryUrl ||
      preferFull
    ) {
      helpers.reportPreviewIssue({
        stage: 'load',
        itemType: itemTypeName,
        url: primaryUrl,
        status: helpers.statusOfPreviewError(primaryLoadError),
        message: helpers.messageOfPreviewError(primaryLoadError),
      })
      throw primaryLoadError
    }
    try {
      const fallbackAsset = helpers.assertScene(
        await helpers.assetLoader.loadAsync(itemDefinition.fallbackUrl),
        itemDefinition.fallbackUrl,
      )
      // 回退成功也要留痕：lite 是运行期首选变体，它坏了说明压缩产物有问题。
      helpers.reportPreviewIssue({
        stage: 'fallback',
        itemType: itemTypeName,
        url: itemDefinition.url,
        status: helpers.statusOfPreviewError(primaryLoadError),
        message: `lite 加载失败，已回退完整件：${helpers.messageOfPreviewError(primaryLoadError)}`,
      })
      return { asset: fallbackAsset, loadedVariant: 'full', preparedCacheKey: null }
    } catch (fallbackLoadError: unknown) {
      helpers.reportPreviewIssue({
        stage: 'load',
        itemType: itemTypeName,
        url: itemDefinition.fallbackUrl,
        status: helpers.statusOfPreviewError(fallbackLoadError),
        message: `主资源与备用资源都失败：${helpers.messageOfPreviewError(primaryLoadError)}；${helpers.messageOfPreviewError(fallbackLoadError)}`,
      })
      throw new AggregateError(
        [primaryLoadError, fallbackLoadError].map((error) =>
          error instanceof Error ? error : new Error(String(error)),
        ),
        '模型 ' + itemTypeName + ' 的主资源和备用资源均不可用',
      )
    }
  }
}
