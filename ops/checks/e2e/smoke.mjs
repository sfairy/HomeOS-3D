#!/usr/bin/env node
/**
 * 端到端冒烟：六条主路径的「能打开、不报错、关键元素在」。
 *
 * ## 为什么不用 Playwright
 *
 * 仓库里没有 Playwright/Vitest，也不打算为「打开 6 个页面」引入一套浏览器二进制与
 * 测试框架。已有的 CDP 客户端（`ops/checks/lib/cdp-session.mjs`）足够覆盖这一层，
 * 而且与视觉检查共用同一套前置环境（开发服务器 + 调试端口浏览器）。
 *
 * ## 断言（每条都必须是可解释的）
 *
 * 1. 页面 `readyState === 'complete'`；
 * 2. `#app` 有子节点（Vue 已挂载，不是白屏）；
 * 3. 页面内的 `error` / `unhandledrejection` / `console.error` 为空（允许白名单噪音）；
 * 4. 场景声明的 `expect` 选择器存在（关键区域真的渲染出来了）。
 *
 * ## 用法
 *
 * ```bash
 * node ops/checks/e2e/smoke.mjs
 * node ops/checks/e2e/smoke.mjs --only auth-login
 * ```
 *
 * 退出码：0 通过 / 1 有失败 / 3 环境缺失。
 */

import process from 'node:process'
import { BASES, cdpAvailable, evaluate, withPage } from '../lib/cdp-session.mjs'

const SMOKE = [
  { name: 'auth-login', base: 'homeos', path: '/login', expect: 'form', requiresAuth: false },
  { name: 'auth-register', base: 'homeos', path: '/register', expect: 'form', requiresAuth: false },
  { name: 'homeos-display', base: 'homeos', path: '/', expect: '#app > *', requiresAuth: true },
  { name: 'homeos-devices', base: 'homeos', path: '/devices', expect: '#app > *', requiresAuth: true },
  { name: 'homeos-events', base: 'homeos', path: '/events', expect: '#app > *', requiresAuth: true },
  { name: 'store-home', base: 'store', path: '/', expect: '#app > *', requiresAuth: false },
]

/** 已知噪音：与本次改动无关、且无法从业务代码消除的浏览器/第三方提示。 */
const IGNORED_ERROR_PATTERNS = [
  /ResizeObserver loop/i,
  /Failed to load resource: the server responded with a status of 404/i,
  /favicon\.ico/i,
  /WebSocket connection to .* failed/i,
  /ERR_CONNECTION_REFUSED.*socket/i,
]

const COLLECT_ERRORS = `window.__smoke = { errors: [], rejections: [] }
window.addEventListener('error', (event) => {
  window.__smoke.errors.push(String(event.message || event.error || 'error'))
})
window.addEventListener('unhandledrejection', (event) => {
  window.__smoke.rejections.push(String(event.reason || 'rejection'))
})
const originalError = console.error.bind(console)
console.error = (...args) => {
  try { window.__smoke.errors.push(args.map((item) => String(item)).join(' ')) } catch {}
  originalError(...args)
}`

const READ_STATE = (selector) => `(() => {
  const app = document.querySelector('#app')
  return {
    readyState: document.readyState,
    appChildren: app ? app.children.length : 0,
    hasExpected: Boolean(document.querySelector(${JSON.stringify(selector)})),
    title: document.title,
    errors: window.__smoke?.errors ?? [],
    rejections: window.__smoke?.rejections ?? [],
  }
})()`

function argValue(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const ONLY = (argValue('only', '') || '').split(',').filter(Boolean)

function isIgnored(message) {
  return IGNORED_ERROR_PATTERNS.some((pattern) => pattern.test(message))
}

async function runScenario(scenario) {
  const state = await withPage({ ...scenario, initScript: COLLECT_ERRORS }, async ({ session }) =>
    evaluate(session, READ_STATE(scenario.expect)),
  )
  const errors = [...state.errors, ...state.rejections].filter((message) => !isIgnored(message))
  const problems = []
  if (state.readyState !== 'complete') problems.push(`readyState=${state.readyState}`)
  if (state.appChildren === 0) problems.push('#app 未挂载')
  if (!state.hasExpected) problems.push(`缺少关键元素：${scenario.expect}`)
  if (state.title.trim() === '') problems.push('document.title 为空')
  if (errors.length) problems.push(`页面报错：${errors.slice(0, 3).join(' | ')}`)
  return problems
}

async function main() {
  const hasCookie = Boolean(process.env.HOMEOS_VISUAL_COOKIE)
  const scenarios = SMOKE.filter(
    (item) => (ONLY.length === 0 || ONLY.includes(item.name)) && (!item.requiresAuth || hasCookie),
  )
  if (scenarios.length === 0) {
    console.error('[e2e] 没有可执行场景。')
    return 2
  }
  if (!(await cdpAvailable())) {
    console.error('[e2e] CDP 不可用；先启动带 --remote-debugging-port=9222 的浏览器。')
    return 3
  }
  try {
    const response = await fetch(BASES[scenarios[0].base], { signal: AbortSignal.timeout(2500) })
    if (!response.ok && response.status >= 500) throw new Error(String(response.status))
  } catch {
    console.error(`[e2e] 前端不可达：${BASES[scenarios[0].base]}；先跑 bun run dev。`)
    return 3
  }

  let failures = 0
  for (const scenario of scenarios) {
    const problems = await runScenario(scenario)
    if (problems.length === 0) {
      console.log(`[e2e] ${scenario.name} ok`)
    } else {
      failures += 1
      console.error(`[e2e] ${scenario.name} FAIL`)
      for (const problem of problems) console.error(`  - ${problem}`)
    }
  }

  if (failures > 0) {
    console.error(`[e2e] ${failures}/${scenarios.length} 个场景失败`)
    return 1
  }
  console.log(`[e2e] 全部 ${scenarios.length} 个场景通过`)
  return 0
}

process.exit(await main())
