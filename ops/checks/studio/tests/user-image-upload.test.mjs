/**
 * `user-image-upload`（0.8.1 新增）的契约测试。
 *
 * 三个入口（资产工具条 / 电视海报 / 弹窗模块）以前各写一份上传逻辑，最容易出现的
 * 三种回归是：格式白名单和后端不一致、单张失败把整批吞掉、传完不刷新目录。
 * 这里把「口径 + 批量状态机 + 可重试刷新」钉住。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const MODULE = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/app/shared/user-image-upload.ts', import.meta.url),
)
const {
  createUserImageUploader,
  imageUploadError,
  isUserImageFile,
  USER_IMAGE_ACCEPT,
  USER_IMAGE_HINT,
  USER_IMAGE_MAX_BYTES,
} = await import(MODULE)

const imageFile = (name, type = 'image/png') => new File([new Uint8Array([1, 2, 3])], name, { type })

test('口径：accept 覆盖 SVG 等图片格式，提示语给出体积上限', () => {
  assert.match(USER_IMAGE_ACCEPT, /image\/svg\+xml/)
  assert.match(USER_IMAGE_ACCEPT, /\.webp/)
  assert.match(USER_IMAGE_HINT, /20MB/)
  assert.equal(isUserImageFile(imageFile('a.png')), true)
  assert.equal(isUserImageFile(imageFile('a.svg')), true)
  // 没有扩展名但带 image/ MIME 也算图片（相机/剪贴板来源）。
  assert.equal(isUserImageFile({ name: 'blob', type: 'image/webp' }), true)
  assert.equal(isUserImageFile(imageFile('a.txt', 'text/plain')), false)
})

test('错误文案：优先服务端 detail，其次 message，最后兜底', () => {
  assert.equal(imageUploadError({ detail: '图片过大' }), '图片过大')
  assert.equal(imageUploadError(new Error('网络错误')), '网络错误')
  assert.equal(imageUploadError(null, '失败'), '失败')
})

test('批量上传：单张失败不中断，成功项仍会刷新目录', async () => {
  const uploaded = []
  const refreshes = []
  const uploader = createUserImageUploader({
    request: async (path, options) => {
      const fileName = decodeURIComponent(String(options.headers['X-File-Name']))
      uploaded.push(fileName)
      if (fileName === 'fail.png') throw new Error('服务器拒绝')
      return { assetId: 'user:' + 'a'.repeat(32) }
    },
    onCatalogUpdated: async () => {
      refreshes.push('refresh')
    },
  })

  const states = []
  uploader.subscribe((state) => states.push(state.busy))

  const result = await uploader.upload([imageFile('ok.png'), imageFile('fail.png')])
  assert.deepEqual(uploaded, ['ok.png', 'fail.png'], '失败后还要继续传下一张')
  assert.deepEqual(result.uploadedAssetIds, ['user:' + 'a'.repeat(32)])
  assert.deepEqual(result.errors, ['fail.png：服务器拒绝'])
  assert.equal(refreshes.length, 1, '有成功项就要刷新目录')
  assert.equal(uploader.state.busy, false)
  assert.match(uploader.state.error, /fail\.png：服务器拒绝/)
  assert.deepEqual(states, [true, false], 'busy 必须成对')
})

test('格式与体积在客户端先拦下，不发请求', async () => {
  let requestCount = 0
  const uploader = createUserImageUploader({
    request: async () => {
      requestCount++
      return { assetId: 'user:' + 'b'.repeat(32) }
    },
  })
  const oversized = imageFile('big.png')
  Object.defineProperty(oversized, 'size', { value: USER_IMAGE_MAX_BYTES + 1 })

  const result = await uploader.upload([imageFile('note.txt', 'text/plain'), oversized])
  assert.equal(requestCount, 0)
  assert.equal(result.uploadedAssetIds.length, 0)
  assert.equal(result.errors.length, 2)
  assert.match(result.errors[0], /仅支持/)
  assert.match(result.errors[1], /超过 20MB/)
})

test('目录刷新失败：保留已上传结果，并提供 retryRefresh', async () => {
  let refreshAttempts = 0
  const uploader = createUserImageUploader({
    request: async () => ({ assetId: 'user:' + 'c'.repeat(32) }),
    onCatalogUpdated: async () => {
      refreshAttempts++
      if (refreshAttempts === 1) throw new Error('目录服务忙碌')
    },
  })

  const result = await uploader.upload([imageFile('ok.png')])
  assert.equal(result.uploadedAssetIds.length, 1, '图片已经传上去了')
  assert.equal(uploader.state.refreshFailed, true)
  assert.match(uploader.state.error, /目录服务忙碌/)

  assert.equal(await uploader.retryRefresh(), true)
  assert.equal(refreshAttempts, 2)
  assert.equal(uploader.state.refreshFailed, false)
  assert.equal(uploader.state.error, '', '刷新成功后要清掉错误')
})

test('dispose 后不再上传、不再刷新', async () => {
  let requestCount = 0
  const uploader = createUserImageUploader({
    request: async () => {
      requestCount++
      return { assetId: 'user:' + 'd'.repeat(32) }
    },
  })
  uploader.dispose()
  const result = await uploader.upload([imageFile('ok.png')])
  assert.equal(requestCount, 0)
  assert.equal(result.uploadedAssetIds.length, 0)
  assert.equal(await uploader.retryRefresh(), false)
})
