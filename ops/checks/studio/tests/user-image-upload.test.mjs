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
  userImageFileProblem,
  USER_IMAGE_ACCEPT,
  USER_IMAGE_HINT,
  USER_IMAGE_UPLOAD_LIMITS,
  USER_IMAGE_MAX_SVG_BYTES,
} = await import(MODULE)

const imageFile = (name, type = 'image/png') => new File([new Uint8Array([1, 2, 3])], name, { type })

test('口径：accept 覆盖 SVG 等图片格式，提示语给出像素与 SVG 上限', () => {
  assert.match(USER_IMAGE_ACCEPT, /image\/svg\+xml/)
  assert.match(USER_IMAGE_ACCEPT, /\.webp/)
  // 0.8.1 口径：位图不限大小，限制是「总像素 / 单边 / SVG 体积」三件。
  assert.match(USER_IMAGE_HINT, /1000 万/)
  assert.match(USER_IMAGE_HINT, /8192/)
  assert.match(USER_IMAGE_HINT, /SVG 最大 5 MB/)
  assert.match(USER_IMAGE_HINT, /位图不限文件大小/)
  assert.equal(USER_IMAGE_UPLOAD_LIMITS, '总像素不超过 1000 万，单边不超过 8192 像素；SVG 最大 5 MB。')
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

test('错误文案：超时 / 413 / 5xx / 断网各有各的下一步', () => {
  // 超时不能直接重试：服务端可能已经收下，只说「失败」会让用户传两份。
  assert.match(imageUploadError({ name: 'TimeoutError' }), /上传超时/)
  assert.match(imageUploadError({ name: 'TimeoutError' }), /确认是否已经上传/)
  assert.match(imageUploadError({ status: 413 }), /压缩/)
  assert.match(imageUploadError({ status: 503 }), /服务器暂时无法接收图片/)
  assert.match(imageUploadError(new TypeError('Failed to fetch')), /网络连接中断/)
  // 没有类别信息时仍然回落到服务端 detail。
  assert.equal(imageUploadError({ status: 400, detail: '图片格式不支持' }), '图片格式不支持')
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
  // 中途会有多条进度 emit，但 busy 只能「开头 true、结尾 false」，中间不许抖动。
  assert.equal(states[0], true)
  assert.equal(states.at(-1), false)
  assert.equal(states.slice(0, -1).includes(false), false, '上传期间 busy 不能中途变 false')
})

test('格式 / 空文件 / SVG 体积在客户端先拦下，不发请求', async () => {
  let requestCount = 0
  const uploader = createUserImageUploader({
    request: async () => {
      requestCount++
      return { assetId: 'user:' + 'b'.repeat(32) }
    },
  })
  const emptyPng = imageFile('empty.png')
  Object.defineProperty(emptyPng, 'size', { value: 0 })
  const oversizedSvg = imageFile('icon.svg', 'image/svg+xml')
  Object.defineProperty(oversizedSvg, 'size', { value: USER_IMAGE_MAX_SVG_BYTES + 1 })

  const result = await uploader.upload([imageFile('note.txt', 'text/plain'), emptyPng, oversizedSvg])
  assert.equal(requestCount, 0)
  assert.equal(result.uploadedAssetIds.length, 0)
  assert.equal(result.errors.length, 3)
  assert.match(result.errors[0], /仅支持/)
  assert.match(result.errors[1], /文件为空/)
  assert.match(result.errors[2], /SVG 文件超过 5 MB/)
})

test('位图不限文件大小：大图交给服务端判定，客户端不拦', async () => {
  let requestCount = 0
  const uploader = createUserImageUploader({
    request: async () => {
      requestCount++
      return { assetId: 'user:' + 'e'.repeat(32) }
    },
  })
  const hugePng = imageFile('huge.png')
  Object.defineProperty(hugePng, 'size', { value: 30 * 1024 * 1024 })

  const result = await uploader.upload([hugePng])
  assert.equal(requestCount, 1, '位图大小由服务端决定（0.8.1 口径不允许客户端先拦）')
  assert.deepEqual(result.errors, [])
  assert.equal(userImageFileProblem(hugePng), null)
})

test('上传结果必须是 user:<32hex>，否则按无效结果报错', async () => {
  const uploader = createUserImageUploader({
    request: async () => ({ assetId: 'user:nothex' }),
  })
  const result = await uploader.upload([imageFile('ok.png')])
  assert.deepEqual(result.uploadedAssetIds, [])
  assert.match(result.errors[0], /上传结果无效/)
})

test('上传过程给出进度，并说明关闭窗口后会继续', async () => {
  const messages = []
  const uploader = createUserImageUploader({
    request: async () => ({ assetId: 'user:' + 'f'.repeat(32) }),
  })
  uploader.subscribe((state) => {
    if (state.message) messages.push(state.message)
  })

  await uploader.upload([imageFile('a.png'), imageFile('b.png')])
  assert.ok(
    messages.some((message) => /正在上传 1\/2：a\.png。关闭窗口后会继续上传。/.test(message)),
    messages.join(' | '),
  )
  assert.ok(messages.some((message) => /正在上传 2\/2：b\.png/.test(message)))
  assert.match(uploader.state.message, /已上传 2 张图片/)
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
