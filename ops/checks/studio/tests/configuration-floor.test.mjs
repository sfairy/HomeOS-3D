/**
 * `configuration-floor` 的契约测试：配置入口在弹楼层选择前，必须拿到「服务端当前」的楼层列表。
 *
 * 三条容易写错且不会报错的口径：
 * - `204` 表示内容没变，要沿用编辑器视图里的 `metadata.floors`（而不是当成空列表报错）；
 * - `200` 必须读 `scene.floors` 且记下新的 `syncKey`；
 * - 超时 / 非 2xx 必须抛错（调用方据此回退并提示），不能静默返回旧列表。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const MODULE = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/runtime/editor/configuration-floor.ts', import.meta.url),
)
const { currentConfigurationFloors } = await import(MODULE)

const metadataFloors = [
  { id: 'f1', name: '一层' },
  { id: 'f2', name: '二层' },
]

test('200：用 scene.floors 并带出新 syncKey，请求带上 projectId / since', async () => {
  const requests = []
  const result = await currentConfigurationFloors({
    sceneId: 'a'.repeat(32),
    projectId: 'proj-1',
    since: 'old-key',
    metadataFloors,
    fetch: async (url, init) => {
      requests.push({ url, init })
      return new Response(
        JSON.stringify({
          scene: { floors: [{ id: 'f9', name: '三层' }, { id: 'f10' }] },
          syncKey: 'new-key',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    },
  })
  assert.deepEqual(result, {
    floors: [
      { id: 'f9', name: '三层' },
      { id: 'f10', name: undefined },
    ],
    syncKey: 'new-key',
    source: 'current',
  })
  assert.match(requests[0].url, /\/current\?projectId=proj-1&since=old-key$/)
  assert.equal(requests[0].init.credentials, 'same-origin')
})

test('204：内容没变时沿用 metadata.floors，不当作错误', async () => {
  const result = await currentConfigurationFloors({
    sceneId: 'b'.repeat(32),
    since: 'same-key',
    metadataFloors,
    fetch: async () => new Response(null, { status: 204 }),
  })
  assert.deepEqual(result, { floors: metadataFloors, syncKey: 'same-key', source: 'metadata' })
})

test('非 2xx：抛服务端 detail；没有 detail 时给统一文案', async () => {
  await assert.rejects(
    currentConfigurationFloors({
      sceneId: 'c'.repeat(32),
      fetch: async () =>
        new Response(JSON.stringify({ detail: '无权访问该户型' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
    }),
    /无权访问该户型/,
  )
  await assert.rejects(
    currentConfigurationFloors({
      sceneId: 'c'.repeat(32),
      fetch: async () => new Response('boom', { status: 500 }),
    }),
    /读取最新楼层失败/,
  )
})

test('超时：主动中断请求并给出超时文案', async () => {
  await assert.rejects(
    currentConfigurationFloors({
      sceneId: 'd'.repeat(32),
      timeoutMs: 5,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    }),
    /读取最新楼层超时/,
  )
})

test('200 但没有楼层：抛错（调用方不能进入空楼层选择）', async () => {
  await assert.rejects(
    currentConfigurationFloors({
      sceneId: 'e'.repeat(32),
      fetch: async () =>
        new Response(JSON.stringify({ scene: { floors: [] } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    }),
    /没有可配置的楼层/,
  )
})
