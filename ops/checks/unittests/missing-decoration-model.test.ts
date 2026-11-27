/**
 * 自定义装饰模型「404 之后」的行为契约（0.8.9 现场缺陷回归）。
 *
 * 现象：删掉一件「我的装饰」后，3D 预览每条都是两条 `GET .../models/<id> 404`
 * 加一条「主资源与备用资源都失败」。三件事叠在一起：
 *
 * 1. **重复请求**：用户装饰的 `url` 与 `fallbackUrl` 是同一个地址（没有 lite/full
 *    两份字节），「回退」等于把同一个 404 再打一次。
 * 2. **误导文案**：于是错误被包装成 AggregateError「主资源与备用资源都失败」，
 *    看起来像两套资源都坏了，实际只有一个地址。
 * 3. **级别过高**：404/410 是「模型已删除」这种预期状态，不该按 error 上报。
 *
 * 这组断言锁住第 1、2 条（纯函数可测）；第 3 条由 `recordLoadFailure` 的分支实现。
 */
import { describe, expect, test } from 'bun:test'

import { loadModelLiteOrFull } from '../../../homeos/frontend/src/studio/authoring/loaders/external-models/model-lite-full-load'

type Attempt = { url: string }

/** 造一个「所有 URL 都 404」的加载环境，并记录实际发出的请求。 */
function createFailingLoader(attempts: Attempt[]) {
  const notFound = () => {
    const error = new Error('HTTP 404') as Error & { response?: { status: number } }
    error.response = { status: 404 }
    return error
  }
  return {
    assetLoader: {
      loadAsync: async (url: string) => {
        attempts.push({ url })
        throw notFound()
      },
    },
    prepareModelTextures: async () => undefined,
    assertScene: (asset: unknown) => asset as Record<string, unknown>,
    reportPreviewIssue: () => undefined,
    statusOfPreviewError: (error: unknown) => (error as { response?: { status?: number } })?.response?.status,
    messageOfPreviewError: (error: unknown) => (error as Error)?.message || String(error),
    isDisposed: () => false,
  }
}

describe('主 / 备 URL 相同时只请求一次', () => {
  test('用户装饰（url === fallbackUrl）不会重复打同一个 404', async () => {
    const attempts: Attempt[] = []
    const url = '/api/v1/studio3d/models/' + 'a'.repeat(32)
    await expect(
      loadModelLiteOrFull({
        itemDefinition: { url, fallbackUrl: url },
        itemTypeName: 'model:' + 'a'.repeat(32),
        preferFull: false,
        templateCacheKey: 'k',
        helpers: createFailingLoader(attempts),
      }),
    ).rejects.toThrow()
    expect(attempts).toHaveLength(1)
    expect(attempts[0].url).toBe(url)
  })

  test('抛的是原始 404，而不是「主备都失败」的 AggregateError', async () => {
    const attempts: Attempt[] = []
    const url = '/api/v1/studio3d/models/' + 'b'.repeat(32)
    const error = await loadModelLiteOrFull({
      itemDefinition: { url, fallbackUrl: url },
      itemTypeName: 'model:' + 'b'.repeat(32),
      preferFull: false,
      templateCacheKey: 'k',
      helpers: createFailingLoader(attempts),
    }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    // AggregateError 是 Error 的子类，所以要显式排除：它的文案会把用户引向
    // 「两套资源都坏了」的错误结论。
    expect(error instanceof AggregateError).toBe(false)
    expect(String((error as Error).message)).toContain('404')
  })

  test('URL 真的不同（lite → full）时仍然回退', async () => {
    const attempts: Attempt[] = []
    await expect(
      loadModelLiteOrFull({
        itemDefinition: { url: '/static/models/sofa-lite.glb', fallbackUrl: '/static/models/sofa.glb' },
        itemTypeName: 'sofa',
        preferFull: false,
        templateCacheKey: 'k',
        helpers: createFailingLoader(attempts),
      }),
    ).rejects.toBeInstanceOf(AggregateError)
    expect(attempts.map((attempt) => attempt.url)).toEqual(['/static/models/sofa-lite.glb', '/static/models/sofa.glb'])
  })
})
