/**
 * 按显示尺寸取图的单测（0.8.9）。
 *
 * 钉住三件「错了不会报错、只会安静变差」的事：
 *
 * 1. URL 判定：给外链/SVG 加参数会 404 或破坏缓存；
 * 2. 尺寸量化：不取整会让「窗口拖动 1px」变成一次新的服务端派生；
 * 3. 分带：不分带会让缓存键从几十个整数爆成连续值。
 */
import { describe, expect, test } from 'bun:test'

import {
  DISPLAY_IMAGE_MAX_EDGE,
  DISPLAY_IMAGE_ROUND,
  createDisplayImageSizing,
  displayImageCropBand,
  displayImageSource,
  isDerivableImageUrl,
  quantizeDisplaySize,
} from '../../../homeos/frontend/src/studio/app/renderer/controls/display-images'

describe('isDerivableImageUrl', () => {
  test('内置素材与用户素材可派生', () => {
    expect(isDerivableImageUrl('/assets/builtin/scene/a.webp')).toBe(true)
    expect(isDerivableImageUrl('/api/v1/assets/user/abc')).toBe(true)
    expect(isDerivableImageUrl('/api/v1/assets/studio3d-export/dir/a.webp')).toBe(true)
  })

  test('带 origin 的绝对地址也能识别', () => {
    expect(isDerivableImageUrl('https://host/api/v1/assets/user/abc')).toBe(true)
  })

  test('SVG 不派生（矢量缩放无损）', () => {
    expect(isDerivableImageUrl('/api/v1/assets/user/abc.svg')).toBe(false)
    expect(isDerivableImageUrl('/api/v1/assets/user/abc.svg?v=1')).toBe(false)
  })

  test('外链 / data: / 其它路径不派生', () => {
    expect(isDerivableImageUrl('https://cdn.example.com/a.png')).toBe(false)
    expect(isDerivableImageUrl('data:image/png;base64,AAAA')).toBe(false)
    expect(isDerivableImageUrl('/static/renderer/a.png')).toBe(false)
    expect(isDerivableImageUrl('')).toBe(false)
  })
})

describe('quantizeDisplaySize', () => {
  test('按 DPR 放大并取整到 64', () => {
    expect(quantizeDisplaySize(200, 120, 2)).toEqual({ width: 384, height: 256 })
  })

  test('1× 屏直接取整', () => {
    expect(quantizeDisplaySize(200, 120, 1)).toEqual({ width: 192, height: 128 })
  })

  test('夹到最小边（图标级不派生过小尺寸）', () => {
    expect(quantizeDisplaySize(4, 4, 1)).toEqual({ width: 64, height: 64 })
  })

  test('夹到上限', () => {
    const size = quantizeDisplaySize(9000, 9000, 2)
    expect(size?.width).toBe(DISPLAY_IMAGE_MAX_EDGE)
    expect(size?.height).toBe(DISPLAY_IMAGE_MAX_EDGE)
  })

  test('零/负/非数返回 null', () => {
    expect(quantizeDisplaySize(0, 100)).toBeNull()
    expect(quantizeDisplaySize(-10, 100)).toBeNull()
    expect(quantizeDisplaySize(Number.NaN, 100)).toBeNull()
  })

  test('取整结果一定是粒度的整数倍', () => {
    const size = quantizeDisplaySize(333, 177, 1.5)
    expect(size).not.toBeNull()
    expect(size!.width % DISPLAY_IMAGE_ROUND).toBe(0)
    expect(size!.height % DISPLAY_IMAGE_ROUND).toBe(0)
  })
})

describe('displayImageCropBand', () => {
  test('16:9 落在正档，9:16 落在负档', () => {
    const wide = displayImageCropBand(16, 9)
    const tall = displayImageCropBand(9, 16)
    expect(wide).toBeGreaterThan(0)
    expect(tall).toBeLessThan(0)
  })

  test('正方形为 0 档', () => {
    expect(displayImageCropBand(100, 100)).toBe(0)
  })

  test('相邻宽高比落进同一档（缓存收敛的关键）', () => {
    expect(displayImageCropBand(1600, 900)).toBe(displayImageCropBand(1610, 900))
  })

  test('极端比例被夹到 ±64', () => {
    expect(displayImageCropBand(100000, 1)).toBe(64)
    expect(displayImageCropBand(1, 100000)).toBe(-64)
  })

  test('非法输入返回 null', () => {
    expect(displayImageCropBand(0, 100)).toBeNull()
    expect(displayImageCropBand(100, 0)).toBeNull()
  })
})

describe('displayImageSource', () => {
  test('不可派生时原样返回', () => {
    expect(displayImageSource('https://cdn.example.com/a.png', { width: 128, height: 64 })).toBe(
      'https://cdn.example.com/a.png',
    )
  })

  test('追加 displaySize', () => {
    expect(displayImageSource('/api/v1/assets/user/abc', { width: 128, height: 64 })).toBe(
      '/api/v1/assets/user/abc?displaySize=128x64',
    )
  })

  test('保留原有查询串（素材版本号）', () => {
    expect(displayImageSource('/api/v1/assets/user/abc?v=9', { width: 128, height: 64 })).toBe(
      '/api/v1/assets/user/abc?v=9&displaySize=128x64',
    )
  })

  test('重复调用不会叠加参数', () => {
    const once = displayImageSource('/api/v1/assets/user/abc', { width: 128, height: 64 })
    expect(displayImageSource(once, { width: 128, height: 64 })).toBe(once)
  })

  test('cover / still / cropBand 分别落到对应参数', () => {
    const url = displayImageSource('/api/v1/assets/user/abc', {
      width: 256,
      height: 256,
      cover: true,
      still: true,
      cropBand: 4,
    })
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('displayFit')).toBe('cover')
    expect(params.get('displayStill')).toBe('1')
    expect(params.get('displayCrop')).toBe('1')
    expect(params.get('displayCropBand')).toBe('4')
  })

  test('保留 hash 片段', () => {
    expect(displayImageSource('/api/v1/assets/user/abc#x', { width: 64, height: 64 })).toEndWith('#x')
  })

  test('非法尺寸原样返回', () => {
    expect(displayImageSource('/api/v1/assets/user/abc', { width: 0, height: 64 })).toBe('/api/v1/assets/user/abc')
  })
})

describe('createDisplayImageSizing', () => {
  function fakeElement(width: number, height: number) {
    return { clientWidth: width, clientHeight: height, isConnected: true } as unknown as Element
  }

  test('批量提交：一次 flush 处理全部元素', () => {
    const pending: FrameRequestCallback[] = []
    const controller = createDisplayImageSizing({
      devicePixelRatio: 1,
      requestAnimationFrame: (callback) => pending.push(callback) as unknown as number,
      cancelAnimationFrame: () => undefined,
    })
    const applied: string[] = []
    controller.observe(fakeElement(200, 120), { source: '/api/v1/assets/user/a' }, (source) => applied.push(source))
    controller.observe(fakeElement(400, 300), { source: '/api/v1/assets/user/b' }, (source) => applied.push(source))
    expect(pending).toHaveLength(1)
    pending[0]!(0)
    expect(applied).toHaveLength(2)
  })

  test('尺寸未变时不重复提交', () => {
    const pending: FrameRequestCallback[] = []
    const controller = createDisplayImageSizing({
      devicePixelRatio: 1,
      requestAnimationFrame: (callback) => pending.push(callback) as unknown as number,
      cancelAnimationFrame: () => undefined,
    })
    const applied: string[] = []
    controller.observe(fakeElement(200, 120), { source: '/api/v1/assets/user/a' }, (source) => applied.push(source))
    pending.shift()!(0)
    controller.invalidate()
    pending.shift()!(0)
    expect(applied).toHaveLength(1)
  })

  test('离屏元素被跳过', () => {
    const pending: FrameRequestCallback[] = []
    const controller = createDisplayImageSizing({
      devicePixelRatio: 1,
      requestAnimationFrame: (callback) => pending.push(callback) as unknown as number,
      cancelAnimationFrame: () => undefined,
    })
    const element = fakeElement(200, 120)
    ;(element as unknown as { isConnected: boolean }).isConnected = false
    const applied: string[] = []
    controller.observe(element, { source: '/api/v1/assets/user/a' }, (source) => applied.push(source))
    pending[0]!(0)
    expect(applied).toHaveLength(0)
  })

  test('取消观察后不再提交', () => {
    const pending: FrameRequestCallback[] = []
    const controller = createDisplayImageSizing({
      devicePixelRatio: 1,
      requestAnimationFrame: (callback) => pending.push(callback) as unknown as number,
      cancelAnimationFrame: () => undefined,
    })
    const applied: string[] = []
    const stop = controller.observe(fakeElement(200, 120), { source: '/api/v1/assets/user/a' }, (source) =>
      applied.push(source),
    )
    stop()
    pending[0]!(0)
    expect(applied).toHaveLength(0)
  })

  test('cover 模式带上分带参数', () => {
    const controller = createDisplayImageSizing({ devicePixelRatio: 1 })
    let captured = ''
    controller.observe(fakeElement(1600, 900), { source: '/api/v1/assets/user/a', cover: true }, (source) => {
      captured = source
    })
    controller.flushNow()
    expect(captured).toContain('displayFit=cover')
    expect(captured).toContain('displayCropBand=')
  })
})
