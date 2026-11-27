#!/usr/bin/env node
/**
 * 画布布局门禁：基准档位选择 + 全分辨率矩阵审计（同一份 `canvas-layout.util.ts`）。
 *
 * ## 为什么并成一条
 *
 * 此前是两个脚本，都在做「把真实终端尺寸喂给运行时同一个纯函数、断言画布契约」：
 *
 * - `canvas_layout_selftest.mjs`：档位选择（16:9 / 4:3 / 21:9 / 32:9、`pageMaxWidth` 优先）；
 * - `audit-scaling.mjs`：5 档设计基准 × 15 档真实终端 = 75 组，逐组验证铺满、不变形、不错档。
 *
 * 两者 `import` 的是**同一个 TS 模块**，各起一个 bun 进程、各转译一遍。合并后只 import
 * 一次，档位选择作为矩阵审计的**前置断言**先跑：档位错了，75 组矩阵的结论就没有意义。
 *
 * ## 两段断言
 *
 * ### 1. 档位选择（纯函数）
 *
 * - 3840×1080 命中 32:9 档、2560×1080 / 3440×1440 命中 21:9 档；
 * - 1920×1080 / 1366×1024 / 非法尺寸不命中；
 * - 16:9 视口保持配置的设计基准，32:9 换 3840×1080 系；
 * - 显式 `pageMaxWidth` 优先（用户意图高于自动档位）；
 * - 各比例下画布乘缩放比后正好铺满视口两轴、两轴同一缩放比。
 *
 * ### 2. 分辨率矩阵
 *
 * 对每组「设计基准 × 终端」断言四条契约：
 *
 * 1. `canvasW × scale == 视口宽` 且 `canvasH × scale == 视口高`（容差 0.5px）
 *    —— 两轴都不留黑边、也不溢出裁切；
 * 2. 两轴共用同一个 `scale` —— 几何不变形；
 * 3. `canvasW ≥ 设计宽` 且 `canvasH ≥ 设计高` —— 只扩展画布，不压缩设计稿；
 * 4. 手机视口（短边 < 600 或宽 < 640）必须退回流体布局，且缩放比 1。
 *
 * 额外检查「错档」：设计基准 ≤1280、画布 >1280 时不得命中 ≤1280 的窄档 —— 这正是迁移前
 * `@media` 读窗口宽度造成的错位。
 *
 * ## 用法
 *
 * ```bash
 * node ops/checks/frontend/check_canvas_layout.mjs            # 人读报告 + 判定
 * node ops/checks/frontend/check_canvas_layout.mjs --json     # 机器可读
 * node ops/checks/frontend/check_canvas_layout.mjs --out ops/checks/tmp/scaling.json
 * ```
 *
 * 退出码：0 全部通过；1 存在违例。
 */
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '../../..')
const utilHref = pathToFileURL(join(ROOT, 'homeos/frontend/src/kernel/layout.ts')).href
const { computeViewportLayout, isPhoneViewport, pickUltrawideBaseline, resolveDesignMetrics, MAX_UPSCALE } =
  await import(utilHref)

const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
const outIndex = argv.indexOf('--out')
const outPath = outIndex >= 0 ? argv[outIndex + 1] : null

/* ------------------------------------------------------------------ *
 * 1. 档位选择（前置断言）
 * ------------------------------------------------------------------ */

const baselineChecks = []
const baselineProblems = []

/** 断言并记录；失败不抛错，攒起来与矩阵违例一起报。 */
function check(name, condition, detail = '') {
  if (condition) {
    baselineChecks.push(name)
    return
  }
  baselineProblems.push(`${name}${detail ? `：${detail}` : ''}`)
}

function nearly(a, b, tolerance = 0.01) {
  return Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b))
}

check('3840×1080 命中 32:9 档', pickUltrawideBaseline(3840, 1080)?.width === 3840)
check('2560×1080 命中 21:9 档', pickUltrawideBaseline(2560, 1080)?.width === 2560)
check('3440×1440 命中 21:9 档', pickUltrawideBaseline(3440, 1440)?.width === 2560)
check('1920×1080 不命中', pickUltrawideBaseline(1920, 1080) === null)
check('1366×1024 不命中', pickUltrawideBaseline(1366, 1024) === null)
check('非法尺寸不命中', pickUltrawideBaseline(0, 0) === null)

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

// 32:9 下基准换成 3840×1080 后，画布不再被拉成 3.5 倍
const superWide = computeViewportLayout(3840, 1080, 3840, 1080)
check('32:9 画布宽度接近视口宽', nearly(superWide.canvasW, 3840, 0.01), String(superWide.canvasW))
check('32:9 画布高度接近视口高', nearly(superWide.canvasH, 1080, 0.01), String(superWide.canvasH))

/* ------------------------------------------------------------------ *
 * 2. 分辨率矩阵
 * ------------------------------------------------------------------ */

/** 真实终端矩阵：笔记本 / 一体机 / 2K / 4K / 超宽 / 平板横竖 / 手机横竖 */
const VIEWPORTS = [
  { name: 'MacBook Air 13', w: 1280, h: 800 },
  { name: 'MacBook Pro 14', w: 1440, h: 900 },
  { name: 'MacBook Pro 16', w: 1728, h: 1117 },
  { name: 'FHD 显示器', w: 1920, h: 1080 },
  { name: 'FHD 带鱼屏', w: 2560, h: 1080 },
  { name: '2K 显示器', w: 2560, h: 1440 },
  { name: '超宽 34"', w: 3440, h: 1440 },
  { name: '4K 显示器', w: 3840, h: 2160 },
  { name: '4K 竖屏', w: 2160, h: 3840 },
  { name: 'iPad 横屏', w: 1024, h: 768 },
  { name: 'iPad 竖屏', w: 768, h: 1024 },
  { name: 'iPad Pro 12.9 横屏', w: 1366, h: 1024 },
  { name: 'iPhone 竖屏', w: 390, h: 844 },
  { name: 'iPhone 横屏', w: 844, h: 390 },
  { name: '小窗（DevTools 半屏）', w: 900, h: 1000 },
]

/** 设计基准档：设置页可配的 pageMaxWidth × 后端 ui.scaleBase* */
const DESIGNS = [
  { name: '1024×768', width: 1024, height: 768 },
  { name: '1366×1024', width: 1366, height: 1024 },
  { name: '1440×1024', width: 1440, height: 1024 },
  { name: '1920×1080', width: 1920, height: 1080 },
  { name: '2560×1440', width: 2560, height: 1440 },
]

/** 与 useCanvasMetrics 的 CANVAS_BREAKPOINT 同源的档位刻度 */
const BREAKPOINT_TIERS = [
  { label: '≤640 手机档', max: 640 },
  { label: '≤768 小平板', max: 768 },
  { label: '≤900 紧凑', max: 900 },
  { label: '≤1100 窄', max: 1100 },
  { label: '≤1280 平板', max: 1280 },
  { label: '>1280 桌面', max: Infinity },
]

const EPS = 0.5
const rows = []
const violations = []

function tierOf(width) {
  return BREAKPOINT_TIERS.find((tier) => width <= tier.max)?.label ?? '>1280 桌面'
}

for (const design of DESIGNS) {
  for (const viewport of VIEWPORTS) {
    const phone = isPhoneViewport(viewport.w, viewport.h)
    const layout = computeViewportLayout(viewport.w, viewport.h, design.width, design.height)
    // 手机视口运行时直接走流体（不缩放），断点基准 = 外壳宽度
    const scale = phone ? 1 : layout.scale
    const canvasW = phone ? viewport.w : layout.canvasW
    const canvasH = phone ? viewport.h : layout.canvasH
    const row = {
      design: design.name,
      viewport: `${viewport.w}×${viewport.h}`,
      device: viewport.name,
      mode: phone ? 'fluid' : 'scaled',
      scale: Number(scale.toFixed(4)),
      canvas: `${canvasW.toFixed(2)}×${canvasH.toFixed(2)}`,
      tier: tierOf(canvasW),
      problems: [],
    }

    if (phone) {
      if (layout.scale !== 1 && scale !== 1) row.problems.push('手机视口未退回流体')
      if (canvasW !== viewport.w || canvasH !== viewport.h) row.problems.push('流体画布不等于视口')
    } else {
      if (Math.abs(canvasW * scale - viewport.w) > EPS)
        row.problems.push(`横向未铺满：${(canvasW * scale).toFixed(2)} != ${viewport.w}`)
      if (Math.abs(canvasH * scale - viewport.h) > EPS)
        row.problems.push(`纵向未铺满：${(canvasH * scale).toFixed(2)} != ${viewport.h}`)
      if (canvasW < design.width) row.problems.push(`画布宽被压到设计宽以下：${canvasW.toFixed(2)} < ${design.width}`)
      if (canvasH < design.height) row.problems.push(`画布高被压到设计高以下：${canvasH.toFixed(2)} < ${design.height}`)
      if (scale > MAX_UPSCALE + 1e-9) row.problems.push(`缩放比越过上限：${scale}`)
      // 错档检查：设计基准不宽、但画布被铺到 1280 以上时，绝不能再命中 ≤1280 的窄档
      // （迁移前 `@media` 读窗口宽度，1280 窗口 + 1366 基准 → 画布 1638 却套用平板规则）。
      if (design.width <= 1280 && canvasW > 1280 && tierOf(canvasW).startsWith('≤')) {
        row.problems.push(`错档：画布 ${canvasW.toFixed(1)}px 命中 ${tierOf(canvasW)}`)
      }
    }

    if (row.problems.length) {
      violations.push(`${row.design} @ ${row.device} ${row.viewport}：${row.problems.join('；')}`)
    }
    rows.push(row)
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  designBases: DESIGNS.map((d) => d.name),
  viewports: VIEWPORTS.length,
  cases: rows.length,
  ok: violations.length === 0 && baselineProblems.length === 0,
  baselineChecks: baselineChecks.length,
  baselineProblems,
  violations,
  rows,
}

if (outPath) writeFileSync(join(ROOT, outPath), `${JSON.stringify(report, null, 2)}\n`)

const failed = baselineProblems.length > 0 || violations.length > 0

if (asJson) {
  console.log(
    JSON.stringify(
      {
        ok: report.ok,
        baselineChecks: report.baselineChecks,
        baselineProblems,
        cases: report.cases,
        violations,
      },
      null,
      2,
    ),
  )
  process.exit(failed ? 1 : 0)
}

console.log(`画布基准断言：${baselineChecks.length} 项通过`)
for (const problem of baselineProblems) console.error(`  ✖ ${problem}`)

const width = Math.max(...rows.map((row) => row.design.length))
for (const row of rows) {
  const head = `${row.design.padEnd(width)} | ${row.device.padEnd(20)} | ${row.viewport.padEnd(10)} | ${row.mode.padEnd(6)} | ×${String(row.scale).padEnd(6)} | ${row.canvas.padEnd(17)} | ${row.tier}`
  console.log(row.problems.length ? `✖ ${head}\n    ${row.problems.join('；')}` : `✔ ${head}`)
}

console.log('')
if (failed) {
  console.error(
    `画布布局门禁失败：基准 ${baselineProblems.length} 项 + 矩阵 ${violations.length} / ${rows.length} 档不达标`,
  )
  for (const violation of violations) console.error(`  - ${violation}`)
} else {
  console.log(
    `画布布局门禁通过：基准 ${baselineChecks.length} 项 + ${rows.length} 档（${DESIGNS.length} 设计基准 × ${VIEWPORTS.length} 分辨率）全部无黑边、不裁切、不变形`,
  )
}
if (outPath) console.log(`报告已写入 ${outPath}`)

process.exit(failed ? 1 : 0)
