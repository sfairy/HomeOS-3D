#!/usr/bin/env node
/**
 * 整页缩放的**真浏览器**审计：在真实页面里验证「画布铺满视口、无溢出、断点按画布宽决策」。
 *
 * 与 `audit-scaling.mjs`（纯函数数学审计，进 gate）分工：
 * - 数学审计保证公式对：`canvas × scale == 视口`，75 档矩阵，毫秒级，无依赖；
 * - 本脚本保证**接线对**：真实的 `.app-shell` 渲染盒、容器查询命中、设置页侧栏形态、
 *   文档级横向溢出。它需要已登录会话，因此不进 gate，按需运行。
 *
 * ## 用法
 *
 * ```bash
 * # 1) 直接给会话 cookie（DevTools → Application → Cookies → auth_token）
 * HOMEOS_AUDIT_TOKEN=xxxx node ops/checks/frontend/audit-scaling-browser.mjs
 *
 * # 2) 给账号密码，脚本自己登录取 cookie
 * HOMEOS_AUDIT_USER=admin HOMEOS_AUDIT_PASS=**** node ops/checks/frontend/audit-scaling-browser.mjs
 *
 * # 只看数学审计
 * node ops/checks/frontend/audit-scaling.mjs
 * ```
 *
 * 环境变量：
 * - `HOMEOS_AUDIT_BASE`   默认 `http://127.0.0.1:8801`
 * - `HOMEOS_AUDIT_TOKEN`  会话 cookie 值（优先级最高）
 * - `HOMEOS_AUDIT_USER` / `HOMEOS_AUDIT_PASS`  账号密码（无 token 时尝试登录）
 * - `HOMEOS_AUDIT_EDGE`   Edge 可执行文件路径（默认 macOS 安装位置）
 *
 * 退出码：0 通过；1 存在违例；3 环境不具备（无凭据）—— 与 ops/gates.mjs 的跳过约定一致。
 *
 * 产物：`docs/analysis/2026-11-08-scaling/browser/` 下的截图与 `report.json`。
 */
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')

const root = resolve(import.meta.dirname, '../../..')
const { isPhoneViewport } = await import(
  pathToFileURL(join(root, 'homeos/frontend/src/shared/utils/layout/canvas-layout.util.ts')).href
)

const BASE = process.env.HOMEOS_AUDIT_BASE || 'http://127.0.0.1:8801'
const TOKEN = process.env.HOMEOS_AUDIT_TOKEN || ''
const USER = process.env.HOMEOS_AUDIT_USER || ''
const PASS = process.env.HOMEOS_AUDIT_PASS || ''
const EDGE = process.env.HOMEOS_AUDIT_EDGE || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
const OUT_DIR = join(root, 'docs/analysis/2026-11-08-scaling/browser')

/** 文档宽度断点（与 useCanvasMetrics 的 CANVAS_BREAKPOINT 同源） */
const TIER = { phone: 640, tablet: 768, compact: 900, wide: 1100, desktop: 1280 }

/**
 * 审计矩阵：覆盖设计基准、笔记本、FHD/2K/4K、平板横竖、手机。
 * 4K 与超宽也包含进来 —— `--hos-vw` 相关回归最容易在这两档出现。
 */
const VIEWPORTS = [
  { name: 'mbp13-1280x800', w: 1280, h: 800 },
  { name: 'mbp14-1440x900', w: 1440, h: 900 },
  { name: 'fhd-1920x1080', w: 1920, h: 1080 },
  { name: 'qhd-2560x1440', w: 2560, h: 1440 },
  { name: 'ipad-768x1024', w: 768, h: 1024 },
  { name: 'ipad-pro-1366x1024', w: 1366, h: 1024 },
  { name: 'iphone-390x844', w: 390, h: 844 },
  // 极端宽高比：画布会沿长边大幅延伸，最容易暴露「布局列没吃掉多出空间」的问题
  { name: 'ultrawide-3440x1440', w: 3440, h: 1440 },
  { name: 'short-1600x600', w: 1600, h: 600 },
  { name: 'tall-800x1280', w: 800, h: 1280 },
  ...randomViewports(Number(process.env.HOMEOS_AUDIT_RANDOM ?? 6), Number(process.env.HOMEOS_AUDIT_SEED ?? Date.now())),
]

/**
 * 真实终端的分辨率是任意值（浏览器窗口、分屏、系统缩放都会产生非常规尺寸），
 * 固定矩阵之外再抽样若干随机尺寸。种子会打印出来，失败时用 HOMEOS_AUDIT_SEED 复现。
 *
 * @param count 抽样数量
 * @param seed 随机种子
 * @returns 视口列表
 */
function randomViewports(count, seed) {
  let state = Math.abs(Math.trunc(seed)) % 2147483647 || 1
  const next = () => (state = (state * 16807) % 2147483647) / 2147483647
  console.log(`随机分辨率种子：HOMEOS_AUDIT_SEED=${seed}`)
  return Array.from({ length: Math.max(0, count) }, () => {
    const w = Math.round(320 + next() * 3520)
    const h = Math.round(480 + next() * 1680)
    return { name: `random-${w}x${h}`, w, h }
  })
}

/** 页面清单：首页 / 设置（验证侧栏形态）/ 设备（验证列表页溢出） */
const PAGES = [
  { name: 'home', path: '/' },
  { name: 'settings', path: '/settings?tab=scaling' },
  { name: 'devices', path: '/devices' },
]

function fail(message) {
  console.log(message)
  process.exit(3)
}

if (!TOKEN && !(USER && PASS)) {
  fail(
    '审计跳过：需要登录凭据。\n  方式一：HOMEOS_AUDIT_TOKEN=<DevTools 里 auth_token 的值>\n  方式二：HOMEOS_AUDIT_USER=... HOMEOS_AUDIT_PASS=...\n（只跑数学审计用 `bun run audit:scaling`，不需要登录）',
  )
}
if (!existsSync(EDGE)) fail(`审计跳过：找不到浏览器 ${EDGE}`)

mkdirSync(OUT_DIR, { recursive: true })

/** 登录并返回 cookie 值；失败返回空串 */
async function loginForToken(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="text"], input[autocomplete="username"]', USER)
  await page.fill('input[type="password"]', PASS)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2500)
  const cookies = await page.context().cookies(BASE)
  return cookies.find((cookie) => cookie.name === 'auth_token')?.value || ''
}

/**
 * 逐页逐档测量。
 *
 * 断言口径全部对齐「可机器验证的契约」：
 * 1. `.app-shell` 的**渲染盒**（已含 transform）必须覆盖视口两轴（±1px）；
 * 2. 文档不得产生横向滚动（`scrollWidth ≤ clientWidth`）；
 * 3. 顶栏 Tab 文案的显隐必须等于 `@container hos-canvas (max-width:1280px)` 的判定；
 * 4. 手机档不得挂 `app-shell--scaling`（自动流体）；
 * 5. 设置页侧栏形态（`settings-shell--compact`）必须等于画布宽 ≤900 的判定。
 */
async function auditPage(page, viewport, target) {
  const problems = []
  await page.setViewportSize({ width: viewport.w, height: viewport.h })
  await page.goto(`${BASE}${target.path}`, { waitUntil: 'domcontentloaded' })
  // 等缩放壳测量完成（useScaling 用 rAF 同步尺寸 + 160ms 拖拽冻结）
  await page.waitForTimeout(900)

  const metrics = await page.evaluate(() => {
    const shell = document.querySelector('.app-shell')
    if (!shell) return null
    const rect = shell.getBoundingClientRect()
    const label = document.querySelector('.tab-bar__tab-label')
    const compactShell = document.querySelector('.settings-shell--compact')
    return {
      canvasW: Math.round(shell.clientWidth),
      canvasH: Math.round(shell.clientHeight),
      renderedW: Math.round(rect.width),
      renderedH: Math.round(rect.height),
      scaling: shell.classList.contains('app-shell--scaling'),
      labelDisplay: label ? getComputedStyle(label).display : 'absent',
      settingsCompact: !!compactShell,
      docScrollW: document.documentElement.scrollWidth,
      docClientW: document.documentElement.clientWidth,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
    }
  })

  if (!metrics) {
    problems.push('未找到 .app-shell（页面可能未登录或仍在加载）')
    return { problems, metrics: null }
  }

  const phone = isPhoneViewport(viewport.w, viewport.h)
  const expectedScaling = !phone

  // 1. 两轴覆盖
  if (Math.abs(metrics.renderedW - viewport.w) > 1) {
    problems.push(`横向未铺满：渲染 ${metrics.renderedW}px ≠ 视口 ${viewport.w}px`)
  }
  if (Math.abs(metrics.renderedH - viewport.h) > 1) {
    problems.push(`纵向未铺满：渲染 ${metrics.renderedH}px ≠ 视口 ${viewport.h}px`)
  }

  // 2. 无横向滚动
  if (metrics.docScrollW > metrics.docClientW + 1) {
    problems.push(`出现横向滚动：scrollWidth ${metrics.docScrollW} > clientWidth ${metrics.docClientW}`)
  }

  // 3. 断点按画布宽决策（顶栏 Tab 文案在 ≤1280 画布下必须隐藏）
  if (metrics.labelDisplay !== 'absent') {
    const shouldHide = metrics.canvasW <= TIER.desktop
    const hidden = metrics.labelDisplay === 'none'
    if (shouldHide !== hidden) {
      problems.push(`顶栏断点错档：画布 ${metrics.canvasW}px 时 tab-label display=${metrics.labelDisplay}`)
    }
  }

  // 4. 手机档自动流体
  if (phone && metrics.scaling) problems.push('手机视口仍在缩放（应自动退回流体）')
  if (!phone && !metrics.scaling) problems.push('桌面/平板视口未开启缩放（偏好注入失败？）')
  if (expectedScaling && Math.abs(metrics.canvasW - metrics.renderedW) > 1) {
    // 画布宽 × scale ≈ 渲染宽；仅记录，不判失败（transform 可能有亚像素）
    metrics.canvasVsRendered = Number((metrics.renderedW / metrics.canvasW).toFixed(4))
  }

  // 5. 设置页侧栏形态
  if (target.name === 'settings') {
    const shouldCompact = metrics.canvasW <= TIER.compact
    if (shouldCompact !== metrics.settingsCompact) {
      problems.push(
        `设置侧栏错档：画布 ${metrics.canvasW}px 时 compact=${metrics.settingsCompact}（应 ${shouldCompact}）`,
      )
    }
  }

  await page.screenshot({
    path: join(OUT_DIR, `${target.name}-${viewport.name}.png`),
    fullPage: false,
  })

  return { problems, metrics }
}

// 每个分辨率一个浏览器：本机 Edge headless 单实例运行约 30 秒后会被关闭，48 次页面加载跑不完。
async function openSession(token) {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
  const page = await context.newPage()
  if (!token) token = await loginForToken(page)
  if (!token) {
    await browser.close()
    throw new Error('登录失败：未拿到 auth_token')
  }
  await context.addCookies([{ name: 'auth_token', value: token, url: BASE }])
  // 注入缩放偏好（真实读法：localStorage 里存字符串 'true'）
  await page.addInitScript(() => window.localStorage.setItem('homeos_viewport_scaling', 'true'))
  return { browser, page, token }
}

const rows = []
let fatal = ''
let token = TOKEN

try {
  for (const viewport of VIEWPORTS) {
    const session = await openSession(token)
    token = session.token
    try {
      for (const target of PAGES) {
        const { problems, metrics } = await auditPage(session.page, viewport, target)
        rows.push({ viewport: viewport.name, page: target.name, metrics, problems })
        const flag = problems.length ? '✖' : '✔'
        console.log(`${flag} ${viewport.name.padEnd(20)} ${target.name.padEnd(9)} 画布 ${metrics?.canvasW ?? '-'}`)
        for (const problem of problems) console.log(`    ${problem}`)
      }
    } finally {
      await session.browser.close()
    }
  }
} catch (error) {
  fatal = error.message
  console.error(`审计执行失败：${fatal}`)
  rows.push({ fatal })
}

const violations = rows.flatMap((row) =>
  (row.problems ?? []).map((problem) => `${row.viewport} / ${row.page}：${problem}`),
)
writeFileSync(
  join(OUT_DIR, 'report.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, ok: !fatal && violations.length === 0, violations, rows }, null, 2)}\n`,
)

console.log('')
if (fatal) {
  console.error(`真浏览器审计未完成：${rows.length - 1} / ${VIEWPORTS.length * PAGES.length} 次页面加载后中断`)
  process.exit(1)
}
if (violations.length) {
  console.error(`真浏览器审计失败：${violations.length} 处`)
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}
console.log(`真浏览器审计通过：${rows.length} 次页面加载（${VIEWPORTS.length} 分辨率 × ${PAGES.length} 页面）`)
