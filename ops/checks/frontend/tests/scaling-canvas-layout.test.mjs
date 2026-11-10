import test from 'node:test'
import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '../../../..')
const utilHref = pathToFileURL(join(root, 'homeos/frontend/src/shared/utils/layout/canvas-layout.util.ts')).href
const { computeViewportLayout, buildCanvasVars, isPhoneViewport, resolveDesignMetrics, MAX_UPSCALE, MIN_SCALE } =
  await import(utilHref)

const DESIGN_W = 1366
const DESIGN_H = 1024

/** 分辨率矩阵：覆盖设计基准、笔记本、FHD/2K/4K、超宽、平板横竖、手机横竖。 */
const MATRIX = [
  { name: '设计基准 1366×1024', vw: 1366, vh: 1024, scale: 1, canvasW: 1366, canvasH: 1024 },
  { name: '笔记本 1280×800', vw: 1280, vh: 800, scale: 0.7813, canvasW: 1638.4, canvasH: 1024 },
  { name: 'MacBook 1440×900', vw: 1440, vh: 900, scale: 0.8789, canvasW: 1638.4, canvasH: 1024 },
  { name: 'FHD 1920×1080', vw: 1920, vh: 1080, scale: 1.0547, canvasW: 1820.4, canvasH: 1024 },
  { name: '2K 2560×1440', vw: 2560, vh: 1440, scale: 1.4063, canvasW: 1820.4, canvasH: 1024 },
  { name: '超宽 3440×1440', vw: 3440, vh: 1440, scale: 1.4063, canvasW: 2446.2, canvasH: 1024 },
  { name: '4K 3840×2160', vw: 3840, vh: 2160, scale: 1.5, canvasW: 2560, canvasH: 1440 },
  { name: 'iPad 横屏 1024×768', vw: 1024, vh: 768, scale: 0.7496, canvasW: 1366, canvasH: 1024.5 },
  { name: 'iPad 竖屏 768×1024', vw: 768, vh: 1024, scale: 0.5622, canvasW: 1366, canvasH: 1821.3 },
]

const near = (actual, expected, tolerance = 0.5) => Math.abs(actual - expected) <= tolerance

for (const item of MATRIX) {
  test(`${item.name}：两轴铺满且等比`, () => {
    const layout = computeViewportLayout(item.vw, item.vh, DESIGN_W, DESIGN_H)
    assert.ok(near(layout.scale, item.scale, 0.0002), `scale ${layout.scale} != ${item.scale}`)
    assert.ok(near(layout.canvasW, item.canvasW), `canvasW ${layout.canvasW} != ${item.canvasW}`)
    assert.ok(near(layout.canvasH, item.canvasH), `canvasH ${layout.canvasH} != ${item.canvasH}`)

    // 契约 1：画布 × 缩放 == 视口（不黑边、不裁切）
    assert.ok(near(layout.canvasW * layout.scale, item.vw), `横向 ${layout.canvasW * layout.scale} != ${item.vw}`)
    assert.ok(near(layout.canvasH * layout.scale, item.vh), `纵向 ${layout.canvasH * layout.scale} != ${item.vh}`)
    // 契约 3：不压缩设计稿
    assert.ok(layout.canvasW >= DESIGN_W - 0.5, `canvasW ${layout.canvasW} < 设计宽`)
    assert.ok(layout.canvasH >= DESIGN_H - 0.5, `canvasH ${layout.canvasH} < 设计高`)
    // 契约 4：只封顶不抬底
    assert.ok(layout.scale <= MAX_UPSCALE + 1e-9)
  })
}

test('缩放是单一系数：横纵比保持视口比例而非设计比例', () => {
  for (const item of MATRIX) {
    const layout = computeViewportLayout(item.vw, item.vh, DESIGN_W, DESIGN_H)
    const canvasRatio = layout.canvasW / layout.canvasH
    const viewportRatio = item.vw / item.vh
    assert.ok(
      near(canvasRatio, viewportRatio, 1e-6),
      `${item.name} 画布比例 ${canvasRatio} != 视口比例 ${viewportRatio}`,
    )
  }
})

/** 固定种子的 mulberry32：失败可复现，又不局限于矩阵里的几档分辨率。 */
function seededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

test('任意分辨率与任意设计基准：铺满、等比、不压缩设计稿', () => {
  const rand = seededRandom(20261110)
  const between = (min, max) => min + rand() * (max - min)
  for (let i = 0; i < 5000; i++) {
    // 视口覆盖从窄条到 8K、从极扁到极高的任意宽高（含非整数，模拟 DPR 缩放后的 CSS 尺寸）
    const vw = between(320, 7680)
    const vh = between(240, 4320)
    const dw = between(800, 2560)
    const dh = between(600, 1600)
    const layout = computeViewportLayout(vw, vh, dw, dh)
    const label = `#${i} 视口 ${vw.toFixed(1)}×${vh.toFixed(1)} 设计 ${dw.toFixed(1)}×${dh.toFixed(1)}`

    assert.ok(near(layout.canvasW * layout.scale, vw, 1e-6), `${label} 横向未铺满`)
    assert.ok(near(layout.canvasH * layout.scale, vh, 1e-6), `${label} 纵向未铺满`)
    assert.ok(near(layout.canvasW / layout.canvasH, vw / vh, 1e-9), `${label} 画布比例与视口比例不一致`)
    assert.ok(layout.canvasW >= dw - 1e-6 && layout.canvasH >= dh - 1e-6, `${label} 设计稿被压缩`)
    assert.ok(layout.scale > 0 && layout.scale <= MAX_UPSCALE + 1e-9, `${label} 缩放比越界 ${layout.scale}`)
    // 设计稿至少有一条边恰好贴满画布（contain），否则说明多扩了画布、字号被无谓缩小
    const tightAxis = near(layout.canvasW, dw, 1e-6) || near(layout.canvasH, dh, 1e-6)
    assert.ok(tightAxis || layout.scale === MAX_UPSCALE, `${label} 两条边都没贴满设计稿`)
  }
})

test('可读性警戒线只提示不参与缩放', () => {
  const laptop = computeViewportLayout(1440, 900, DESIGN_W, DESIGN_H)
  assert.equal(laptop.belowReadable, false)
  const phone = computeViewportLayout(390, 844, DESIGN_W, DESIGN_H)
  assert.equal(phone.belowReadable, true)
  assert.ok(phone.scale < MIN_SCALE)
  // 低于警戒线仍然完整铺满，不触发滚动式兜底
  assert.ok(near(phone.canvasW * phone.scale, 390))
  assert.ok(near(phone.canvasH * phone.scale, 844))
})

test('非法视口尺寸不产生 NaN / Infinity', () => {
  for (const [vw, vh] of [
    [0, 0],
    [-100, 500],
    [Number.NaN, Number.NaN],
    [Number.POSITIVE_INFINITY, 900],
  ]) {
    const layout = computeViewportLayout(vw, vh, DESIGN_W, DESIGN_H)
    for (const [key, value] of Object.entries(layout)) {
      if (typeof value !== 'number') continue
      assert.ok(Number.isFinite(value), `${key} 不是有限数：${value}`)
    }
    assert.ok(layout.scale > 0)
  }
})

test('非法设计基准回退到缺省值', () => {
  const layout = computeViewportLayout(1440, 900, 0, Number.NaN)
  assert.equal(layout.designW, 1366)
  assert.equal(layout.designH, 1024)
  assert.ok(Number.isFinite(layout.scale))
})

test('画布变量与布局同源（弹窗 max-height 不再读真实视口）', () => {
  const layout = computeViewportLayout(1920, 1080, DESIGN_W, DESIGN_H)
  const vars = buildCanvasVars(layout)
  assert.equal(vars['--hos-vw'], `${layout.canvasW}px`)
  assert.equal(vars['--hos-vh'], `${layout.canvasH}px`)
  assert.equal(vars['--hos-screen-w'], `${layout.canvasW}px`)
  assert.equal(vars['--hos-screen-h'], `${layout.canvasH}px`)
})

test('手机视口判定：手机横竖都命中，平板不命中', () => {
  assert.equal(isPhoneViewport(390, 844), true)
  assert.equal(isPhoneViewport(844, 390), true)
  assert.equal(isPhoneViewport(414, 896), true)
  assert.equal(isPhoneViewport(768, 1024), false)
  assert.equal(isPhoneViewport(1024, 768), false)
  assert.equal(isPhoneViewport(1366, 1024), false)
})

test('设计基准来源统一：pageMaxWidth 优先，缺省回退 ui 配置', () => {
  assert.deepEqual(resolveDesignMetrics({ pageMaxWidth: 1920, ui: { scaleBaseWidth: 1366, scaleBaseHeight: 1024 } }), {
    width: 1920,
    height: 1024,
  })
  assert.deepEqual(resolveDesignMetrics({ pageMaxWidth: 0, ui: { scaleBaseWidth: 1600, scaleBaseHeight: 900 } }), {
    width: 1600,
    height: 900,
  })
  assert.deepEqual(resolveDesignMetrics({ pageMaxWidth: null, ui: null }), { width: 1366, height: 1024 })
  assert.deepEqual(resolveDesignMetrics({ pageMaxWidth: Number.NaN, ui: { scaleBaseWidth: Number.NaN } }), {
    width: 1366,
    height: 1024,
  })
})
