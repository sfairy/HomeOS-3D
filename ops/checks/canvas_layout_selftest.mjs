/**
 * 画布基准 / 超宽档位自检（纯函数，不依赖 DOM）。
 *
 * 覆盖审计 P48 / U-06：
 * - 16:9 与 4:3 视口**不受影响**（仍然用配置的设计基准）；
 * - 21:9 / 32:9 按宽高比换 16:9 系基准，画布比例仍等于视口比例（不裁切、不变形）；
 * - `pageMaxWidth` 显式配置时优先保留（用户意图高于自动档位）。
 *
 * 用法：node ops/checks/canvas-layout-selftest.mjs
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
// 源码是 TS：用 bun 自带的转译能力跑，这里只做断言脚本。
const target = pathToFileURL(resolve(ROOT, 'homeos/frontend/src/shared/utils/layout/canvas-layout.util.ts')).href

const mod = await import(target)
const { computeViewportLayout, resolveDesignMetrics, pickUltrawideBaseline } = mod

const CHECKS = []
function check(name, condition, detail = '') {
  if (!condition) throw new Error(`${name} 失败${detail ? `：${detail}` : ''}`)
  CHECKS.push(name)
}

function nearly(a, b, tolerance = 0.01) {
  return Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b))
}

// 1. 超宽档位匹配
check('3840×1080 命中 32:9 档', pickUltrawideBaseline(3840, 1080)?.width === 3840)
check('2560×1080 命中 21:9 档', pickUltrawideBaseline(2560, 1080)?.width === 2560)
check('3440×1440 命中 21:9 档', pickUltrawideBaseline(3440, 1440)?.width === 2560)
check('1920×1080 不命中', pickUltrawideBaseline(1920, 1080) === null)
check('1366×1024 不命中', pickUltrawideBaseline(1366, 1024) === null)
check('非法尺寸不命中', pickUltrawideBaseline(0, 0) === null)

// 2. 设计基准选择
const legacyUi = { scaleBaseWidth: 1366, scaleBaseHeight: 1024 }
check('16:9 保持配置值', resolveDesignMetrics({ ui: legacyUi, viewport: { width: 1920, height: 1080 } }).width === 1366)
check(
  '32:9 换 3840×1080',
  resolveDesignMetrics({ ui: legacyUi, viewport: { width: 3840, height: 1080 } }).height === 1080,
)
check(
  '显式 pageMaxWidth 优先',
  resolveDesignMetrics({ pageMaxWidth: 2560, ui: legacyUi, viewport: { width: 3840, height: 1080 } }).width === 2560,
)

// 3. 画布比例恒等于视口比例（超宽不裁切、不变形）
for (const [vw, vh, label] of [
  [1920, 1080, '16:9'],
  [2560, 1080, '21:9'],
  [3840, 1080, '32:9'],
  [1366, 1024, '4:3'],
]) {
  const metrics = resolveDesignMetrics({ ui: legacyUi, viewport: { width: vw, height: vh } })
  const layout = computeViewportLayout(vw, vh, metrics.width, metrics.height)
  check(
    `${label} 画布铺满视口宽`,
    nearly(layout.canvasW * layout.scale, vw, 0.005),
    `${layout.canvasW} × ${layout.scale}`,
  )
  check(
    `${label} 画布铺满视口高`,
    nearly(layout.canvasH * layout.scale, vh, 0.005),
    `${layout.canvasH} × ${layout.scale}`,
  )
  check(
    `${label} 两向同一缩放比`,
    nearly(layout.canvasW / layout.canvasH, vw / vh, 0.01),
    `${layout.canvasW}/${layout.canvasH}`,
  )
}

// 4. 32:9 下画布不再被拉成 3.5 倍：基准换成 3840×1080 后宽度与视口同量级
const superWide = computeViewportLayout(3840, 1080, 3840, 1080)
check('32:9 画布宽度接近视口宽', nearly(superWide.canvasW, 3840, 0.01), String(superWide.canvasW))
check('32:9 画布高度接近视口高', nearly(superWide.canvasH, 1080, 0.01), String(superWide.canvasH))

console.log(`画布基准自检通过：${CHECKS.length} 项`)
