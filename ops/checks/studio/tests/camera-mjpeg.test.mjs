/**
 * 摄像头 MJPEG 帧协议（0.8.1 `camera-mjpeg`）的契约测试。
 *
 * 这段代码直接吃不可信的 multipart 响应，判错的表现不是异常而是「黑屏 / 卡住 /
 * 内存涨」，所以必须把四条守卫逐个钉住：boundary、单帧头 8 KiB、单帧 8 MiB、JPEG SOI。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const moduleUrl = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/runtime/camera/camera-mjpeg.ts', import.meta.url),
)
const { CAMERA_MJPEG_ERRORS, parseMultipartBoundary, readMjpegFrames } = await import(moduleUrl)

const encoder = new TextEncoder()
const streamOf = (chunks) =>
  new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
const bytes = (...values) => Uint8Array.from(values)
test('boundary 解析：带引号 / 不带引号 / 非 multipart', () => {
  assert.equal(
    parseMultipartBoundary('multipart/x-mixed-replace; boundary=my-boundary'),
    'my-boundary',
  )
  assert.equal(
    parseMultipartBoundary('multipart/x-mixed-replace; boundary="quoted-boundary"'),
    'quoted-boundary',
  )
  assert.equal(parseMultipartBoundary('image/jpeg'), '')
  assert.equal(parseMultipartBoundary(null), '')
})

test('逐帧读取：拆出两帧并跳过 part 头', async () => {
  const head = encoder.encode('--b\r\nContent-Type: image/jpeg\r\n\r\n'),
    firstFrame = bytes(0xff, 0xd8, 0x01, 0xd9),
    secondFrame = bytes(0xff, 0xd8, 0x02, 0xd9),
    body = new Uint8Array([
      ...head,
      ...firstFrame,
      ...encoder.encode('\r\n--b\r\nContent-Type: image/jpeg\r\n\r\n'),
      ...secondFrame,
      ...encoder.encode('\r\n--b--\r\n'),
    ]),
    frames = []
  for await (const frame of readMjpegFrames(streamOf([body.slice(0, 9), body.slice(9)]), 'b'))
    frames.push(frame)
  assert.equal(frames.length, 2)
  assert.deepEqual([...frames[0]], [...firstFrame])
  assert.deepEqual([...frames[1]], [...secondFrame])
})

test('帧不以 JPEG SOI 开头：判格式错误', async () => {
  const body = new Uint8Array([
    ...encoder.encode('--b\r\nContent-Type: image/jpeg\r\n\r\n'),
    ...bytes(0x00, 0x01),
    ...encoder.encode('\r\n--b--\r\n'),
  ])
  await assert.rejects(async () => {
    for await (const _frame of readMjpegFrames(streamOf([body]), 'b')) {
      // 不应产出帧
    }
  }, (error) => error.code === 'format' && error.message === CAMERA_MJPEG_ERRORS.format)
})

test('part 头超过 8 KiB：判格式错误', async () => {
  const oversizedHeader = encoder.encode('--b\r\nContent-Type: image/jpeg\r\n' + 'x'.repeat(9000))
  await assert.rejects(async () => {
    for await (const _frame of readMjpegFrames(streamOf([oversizedHeader]), 'b')) {
      // 不应产出帧
    }
  }, (error) => error.code === 'format')
})

test('Content-Length 超过 8 MiB：在读取 body 前就拒绝', async () => {
  const body = encoder.encode('--b\r\nContent-Type: image/jpeg\r\nContent-Length: 9000000\r\n\r\n')
  await assert.rejects(async () => {
    for await (const _frame of readMjpegFrames(streamOf([body]), 'b')) {
      // 不应产出帧
    }
  }, (error) => error.code === 'frameTooLarge')
})

test('缺少 Content-Type: image/jpeg：判格式错误', async () => {
  const body = new Uint8Array([
    ...encoder.encode('--b\r\nContent-Type: text/html\r\n\r\n'),
    ...bytes(0xff, 0xd8),
    ...encoder.encode('\r\n--b--\r\n'),
  ])
  await assert.rejects(async () => {
    for await (const _frame of readMjpegFrames(streamOf([body]), 'b')) {
      // 不应产出帧
    }
  }, (error) => error.code === 'format')
})

test('空 boundary：直接拒绝', async () => {
  await assert.rejects(async () => {
    for await (const _frame of readMjpegFrames(streamOf([bytes(1)]), '')) {
      // 不应产出帧
    }
  }, (error) => error.code === 'format')
})
