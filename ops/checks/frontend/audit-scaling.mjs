#!/usr/bin/env node
/**
 * 整页缩放分辨率审计：逐档验证「无黑边、不裁切、不变形、设计稿不被压缩、断点档位正确」。
 *
 * ## 审什么
 *
 * 对每个「设备分辨率 × 设计基准」组合，用**与运行时同一份**纯函数
 * `computeViewportLayout` 算出画布，然后断言四条契约：
 *
 * 1. `canvasW × scale == 视口宽` 且 `canvasH × scale == 视口高`（容差 0.5px）
 *    —— 画布乘缩放比后正好铺满视口，两轴都不留黑边、也不溢出裁切；
 * 2. 两轴共用同一个 `scale` —— 几何不变形；
 * 3. `canvasW ≥ 设计宽` 且 `canvasH ≥ 设计高` —— 只扩展画布，不压缩设计稿；
 * 4. 手机视口（短边 < 600 或宽 < 640）必须退回流体布局，且缩放比 1。
 *
 * 额外输出每一档在 `@container hos-canvas` 下命中的宽度档位（与
 * `useCanvasMetrics` 的档位常量同源），并检查「画布宽度 ≥ 1366 时不得命中
 * ≤1280 的窄档」——这正是迁移前 `@media` 读窗口宽度造成的错档。
 *
 * ## 用法
 *
 * ```bash
 * node ops/checks/frontend/audit-scaling.mjs            # 人读报告
 * node ops/checks/frontend/audit-scaling.mjs --json     # 机器可读（CI / 归档）
 * node ops/checks/frontend/audit-scaling.mjs --out ops/checks/frontend/scaling-audit.json
 * ```
 *
 * 退出码：0 全部通过；1 存在违例。
 */
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '../../..')
const utilHref = pathToFileURL(join(root, 'homeos/frontend/src/shared/utils/layout/canvas-layout.util.ts')).href
const { computeViewportLayout, isPhoneViewport, MAX_UPSCALE } = await import(utilHref)

const asJson = process.argv.includes('--json')
const outIndex = process.argv.indexOf('--out')
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : null

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
  ok: violations.length === 0,
  violations,
  rows,
}

if (outPath) writeFileSync(join(root, outPath), `${JSON.stringify(report, null, 2)}\n`)

if (asJson) {
  console.log(JSON.stringify({ ok: report.ok, cases: report.cases, violations }, null, 2))
} else {
  const width = Math.max(...rows.map((row) => row.design.length))
  for (const row of rows) {
    const head = `${row.design.padEnd(width)} | ${row.device.padEnd(20)} | ${row.viewport.padEnd(10)} | ${row.mode.padEnd(6)} | ×${String(row.scale).padEnd(6)} | ${row.canvas.padEnd(17)} | ${row.tier}`
    console.log(row.problems.length ? `✖ ${head}\n    ${row.problems.join('；')}` : `✔ ${head}`)
  }
  console.log('')
  if (violations.length) {
    console.error(`缩放审计失败：${violations.length} / ${rows.length} 档不达标`)
    for (const violation of violations) console.error(`  - ${violation}`)
  } else {
    console.log(
      `缩放审计通过：${rows.length} 档（${DESIGNS.length} 设计基准 × ${VIEWPORTS.length} 分辨率）全部无黑边、不裁切、不变形`,
    )
  }
  if (outPath) console.log(`报告已写入 ${outPath}`)
}

process.exit(violations.length === 0 ? 0 : 1)
