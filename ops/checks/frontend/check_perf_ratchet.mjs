#!/usr/bin/env node
/**
 * 前端性能棘轮：把「已经证明会拖慢交互/内存」的四种写法钉住，**只许降、不许增**。
 *
 * 为什么是棘轮而不是 lint 规则：这些写法在 studio 里存量很大（深层监听几百处、
 * `transition: all` 上百处），一次性清零不现实；但「不再变多」可以从今天开始守。
 * 做法与 check_frontend_complexity.mjs / ui_overflow_ratchet.mjs 一致：
 * 基线逐文件记录计数，任一文件比基线多、或新文件出现即失败。清理后跑 `--write` 压低基线。
 *
 * 四条口径（都能被静态解析，不需要跑浏览器）：
 *
 * 1. `deep: true` —— 多源 watcher 里一旦有一个 `deep`，**任何**源（含 `visible` 这类
 *    标量）变化都会深度遍历全部大数组；图表类改「数据版本号」即可等价。
 * 2. `transition: all` —— 会为所有可动画属性挂过渡；数据一刷就把背景/边框/几何一起
 *    纳入过渡计算，浏览器每次样式失效都要重算过渡属性表。只该写实际动的那两三个属性。
 * 3. Studio 内**匿名** `pagehide` 监听 —— SPA 路由切换不触发 pagehide，匿名闭包无法摘除，
 *    会把整个 `appCtx`（含户型文档）连同渲染器一起留住。Studio 必须走
 *    `bindNamedPageHideOnce` 这类具名注册，由 teardown 对称摘除。
 * 4. 渲染热路径文件里的 `JSON.stringify(` —— 只有在**已经变化**时才该序列化；
 *    先 `stringify` 再和 dataset 比字符串，等于每帧都分配一次再比较。
 *
 * 用法：
 *   node ops/checks/frontend/check_perf_ratchet.mjs            # 校验
 *   node ops/checks/frontend/check_perf_ratchet.mjs --write    # 重写基线（只能变小才该跑）
 *   node ops/checks/frontend/check_perf_ratchet.mjs --json     # 机器可读输出
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { walkFiles } from '../../lib/walk.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const BASELINE = resolve(ROOT, 'ops/checks/perf-ratchet-baseline.json')

const FRONTEND_ROOTS = ['homeos/frontend/src', 'homeos-store/frontend/src']
const STUDIO_ROOT = 'homeos/frontend/src/studio'

/**
 * 渲染热路径文件：每帧都会走到，这里的 `JSON.stringify` 必须先比较标量、变化时才序列化。
 * 只钉这三个文件，避免把「导出 / 调试」路径的正常序列化也算进来。
 */
const HOT_RENDER_FILES = new Set([
  'homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/render/createStudioRenderer.ts',
  'homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/render/studio-render-loop.ts',
  'homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/lights/scene-shadows-control.ts',
])

const DEEP_RE = /\bdeep\s*:\s*true\b/g
const TRANSITION_ALL_RE = /transition\s*:\s*all\b/g
/**
 * 匿名 `pagehide`：第二个实参是箭头函数 / 函数表达式。
 * 具名写法（`, disposeX` 或 `, () => {}` 之外）不算 —— 具名的可以在 teardown 里摘。
 * 之所以把箭头也判为匿名：箭头没有稳定引用，除非先赋给常量，否则无处摘除。
 */
const ANON_PAGEHIDE_RE =
  /addEventListener\s*\(\s*['"]pagehide['"]\s*,\s*(?:\(\s*\)|\(?\s*[\w$]+\s*\)?\s*=>|function\b)/g
const STRINGIFY_RE = /\bJSON\.stringify\s*\(/g

function count(re, source) {
  return (source.match(re) || []).length
}

function rel(file) {
  return relative(ROOT, file).split('\\').join('/')
}

function collect() {
  const metrics = { deepWatch: {}, transitionAll: {}, anonPagehide: {}, hotStringify: {} }

  for (const root of FRONTEND_ROOTS) {
    const files = walkFiles(resolve(ROOT, root), { extensions: new Set(['.ts', '.vue', '.css']) })
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      const key = rel(file)
      const isCss = key.endsWith('.css')

      if (!isCss) {
        const deep = count(DEEP_RE, source)
        if (deep) metrics.deepWatch[key] = deep
      }

      if (isCss || key.endsWith('.vue')) {
        const transitionAll = count(TRANSITION_ALL_RE, source)
        if (transitionAll) metrics.transitionAll[key] = transitionAll
      }
    }
  }

  const studioFiles = walkFiles(resolve(ROOT, STUDIO_ROOT), { extensions: new Set(['.ts', '.vue']) })
  for (const file of studioFiles) {
    const anon = count(ANON_PAGEHIDE_RE, readFileSync(file, 'utf8'))
    if (anon) metrics.anonPagehide[rel(file)] = anon
  }

  for (const key of HOT_RENDER_FILES) {
    const source = readFileSync(resolve(ROOT, key), 'utf8')
    const stringify = count(STRINGIFY_RE, source)
    if (stringify) metrics.hotStringify[key] = stringify
  }

  return metrics
}

function loadBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE, 'utf8'))
  } catch {
    return {}
  }
}

const LABELS = {
  deepWatch: 'deep:true 监听',
  transitionAll: 'transition:all',
  anonPagehide: '匿名 pagehide 监听',
  hotStringify: '渲染热路径 JSON.stringify',
}

const HINTS = {
  deepWatch: '改成显式指纹 / 数据版本号，只监听真正消费的字段。',
  transitionAll: '列举实际动画的属性（background-color / border-color / opacity 等）。',
  anonPagehide: '改用具名注册（如 bindNamedPageHideOnce），由 teardown 对称摘除。',
  hotStringify: '先比较标量，只有变化时才 stringify 写 dataset。',
}

function compare(metric, current, base) {
  const failures = []
  for (const [file, count] of Object.entries(current)) {
    const allowed = base[file] ?? 0
    if (count > allowed) failures.push(`${file}: ${LABELS[metric]} ${allowed} → ${count}`)
  }
  return failures
}

function total(map) {
  return Object.values(map).reduce((a, b) => a + b, 0)
}

function main() {
  const write = process.argv.includes('--write')
  const asJson = process.argv.includes('--json')
  const current = collect()

  if (write) {
    writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
    console.log(
      `性能基线已更新：${LABELS.deepWatch} ${total(current.deepWatch)} 处 / ` +
        `${LABELS.transitionAll} ${total(current.transitionAll)} 处 / ` +
        `${LABELS.anonPagehide} ${total(current.anonPagehide)} 处 / ` +
        `${LABELS.hotStringify} ${total(current.hotStringify)} 处`,
    )
    return 0
  }

  const base = loadBaseline()
  const failures = []
  for (const metric of Object.keys(LABELS)) {
    failures.push(...compare(metric, current[metric] || {}, base[metric] || {}))
  }

  if (asJson) {
    console.log(JSON.stringify({ ok: failures.length === 0, current, failures }, null, 2))
  }

  if (failures.length) {
    if (!asJson) {
      console.error('性能棘轮失败（这些新增会让交互更卡或内存更高）：')
      for (const item of failures) console.error(`  - ${item}`)
      for (const metric of Object.keys(LABELS)) console.error(`  ${LABELS[metric]}：${HINTS[metric]}`)
    }
    return 1
  }

  if (!asJson) {
    console.log(
      `性能棘轮通过（${LABELS.deepWatch} ${total(current.deepWatch)} / ` +
        `${LABELS.transitionAll} ${total(current.transitionAll)} / ` +
        `${LABELS.anonPagehide} ${total(current.anonPagehide)} / ` +
        `${LABELS.hotStringify} ${total(current.hotStringify)}）`,
    )
  }
  return 0
}

process.exit(main())
