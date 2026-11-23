#!/usr/bin/env node
/**
 * 前端性能棘轮：把「已经证明会拖慢交互/内存」的四种写法钉住，**只许降、不许增**。
 *
 * 为什么是棘轮而不是 lint 规则：这些写法在 studio 里存量很大（深层监听几百处、
 * `transition: all` 上百处），一次性清零不现实；但「不再变多」可以从今天开始守。
 * 做法与其他棘轮一致：基线逐文件记录计数，任一文件比基线多、或新文件出现即失败。
 * 清理后跑 `--update` 压低基线。
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
 * 用法（单跑；批量入口 `bun run check:frontend` 也会带上它）：
 *   node ops/checks/frontend/check_perf_ratchet.mjs            # 校验
 *   node ops/checks/frontend/check_perf_ratchet.mjs --update   # 重写基线（原 `--write`）
 *   node ops/checks/frontend/check_perf_ratchet.mjs --json     # 机器可读输出
 */
import { join, resolve } from 'node:path'

import { isMain } from '../../lib/cli.mjs'
import { createCli, createContext, perFileProblems, readBaseline, writeBaseline } from '../../lib/ratchet.mjs'

const BASELINE_REL = 'ops/checks/baselines/frontend/perf-ratchet-baseline.json'
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

/** @param {RegExp} re @param {string} source */
function count(re, source) {
  return (source.match(re) || []).length
}

/** @param {Map<string, Record<string, number>>} map */
function total(map) {
  return Object.values(map).reduce((a, b) => a + b, 0)
}

/**
 * @param {ReturnType<typeof createContext>} ctx
 */
export function scan(ctx) {
  const metrics = { deepWatch: {}, transitionAll: {}, anonPagehide: {}, hotStringify: {} }

  for (const file of ctx.walkMany(FRONTEND_ROOTS, new Set(['.ts', '.vue', '.css']))) {
    const key = ctx.rel(file)
    const source = ctx.text(file)
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

  for (const file of ctx.walk(STUDIO_ROOT, new Set(['.ts', '.vue']))) {
    const anon = count(ANON_PAGEHIDE_RE, ctx.text(file))
    if (anon) metrics.anonPagehide[ctx.rel(file)] = anon
  }

  for (const key of HOT_RENDER_FILES) {
    const stringify = count(STRINGIFY_RE, ctx.text(resolve(ctx.repoRoot, key)))
    if (stringify) metrics.hotStringify[key] = stringify
  }

  return metrics
}

/**
 * @param {ReturnType<typeof createContext>} ctx
 * @param {{update?: boolean}} [options]
 */
export function audit(ctx, { update = false } = {}) {
  const baselinePath = join(ctx.repoRoot, BASELINE_REL)
  const current = scan(ctx)
  const summary = Object.keys(LABELS)
    .map((metric) => `${LABELS[metric]} ${total(current[metric])}`)
    .join(' / ')

  if (update) {
    writeBaseline(baselinePath, current)
    return { name: '性能棘轮', summary: `基线已更新：${summary}`, updated: true, problems: [] }
  }

  const loaded = readBaseline(baselinePath, ctx.rel(baselinePath))
  // 旧实现缺基线时按空基线判定（全部算新增）：保持一致，避免「删掉基线即静默通过」。
  const base = loaded.ok ? loaded.data : {}
  const problems = Object.keys(LABELS).flatMap((metric) =>
    perFileProblems(
      current[metric] || {},
      base[metric] || {},
      ['count'],
      (file, _m, before, after) => `${file}: ${LABELS[metric]} ${before} → ${after}`,
    ),
  )

  return {
    name: '性能棘轮',
    summary,
    problems,
    hints: problems.length > 0 ? Object.keys(LABELS).map((metric) => `${LABELS[metric]}：${HINTS[metric]}`) : [],
    json: { ok: problems.length === 0, current, failures: problems },
  }
}

/** 单跑入口；`--write` 保留为 `--update` 的别名（旧脚本名沿用）。 */
export const cli = createCli(audit, { repoRoot: resolve(import.meta.dirname, '../../..'), aliases: ['--write'] })

if (isMain(import.meta.url)) process.exit(cli())
