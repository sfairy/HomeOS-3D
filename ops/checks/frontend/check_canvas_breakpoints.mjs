#!/usr/bin/env node
/**
 * 画布断点守卫：壳层样式不得再用「窗口宽度」决策布局。
 *
 * ## 为什么需要
 *
 * 整页等比缩放开启后，`.app-shell` 是一块可能远宽于窗口的画布
 * （1280 窗口 + 1366 设计基准 → 画布 1638；1920 窗口 → 画布 1820）。
 * 此时 `@media (max-width: 900px)` 读的是**窗口**（1280 > 900，不命中），
 * 而实际布局盒有 1638px —— 语义错位，是「缩放后顶栏文字消失 / 操作区被裁」
 * 的根因。正确写法是 `@container hos-canvas (...)`：
 *
 * - `.app-shell` 上声明了 `container-type: inline-size; container-name: hos-canvas`，
 *   容器宽度就是画布宽度；
 * - 登录 / 激活 / 3D 绘制 / 整屏展示这些没有主壳的路由，由 `body` 上的同名容器兜底，
 *   其宽度等于窗口宽度，与旧的 `@media` 完全等价。
 *
 * ## 判定口径
 *
 * 规则内出现 `@media` 且带宽度条件（`min-width` / `max-width` /
 * `min-inline-size` / `max-inline-size` 或 range 语法）即为违规，除非：
 *
 * - 文件在基线 `ops/checks/baselines/frontend/canvas-breakpoints-baseline.json` 的 `allow` 里
 *   （`.viewport-frame` 这类**容器自身/其祖先**的元素，容器查询无法作用于自己）；
 * - 路径在 `EXEMPT_DIRS`（studio 3D runtime 用独立的 iframe 视口与 `--i3d-*` 缩放，
 *   不在主壳内，按窗口决策是设计意图）。
 *
 * 另外禁止 `html:not(.hos-canvas-scaled)` 门控：那是旧方案，容器查询已取代它。
 *
 * ## 用法
 *
 * ```bash
 * node ops/checks/frontend/check_canvas_breakpoints.mjs          # 校验
 * node ops/checks/frontend/check_canvas_breakpoints.mjs --json   # 机器可读
 * ```
 */
import { join } from 'node:path'

import { isMain } from '../../lib/cli.mjs'
import { createContext, readBaseline, report } from '../../lib/ratchet.mjs'

/** 参与校验的范围：主壳渲染路径上的所有样式 */
const SCOPE_DIRS = [
  'homeos/frontend/src/layouts',
  'homeos/frontend/src/components',
  'homeos/frontend/src/features',
  'homeos/frontend/src/assets/styles',
]

/**
 * 豁免目录。
 *
 * studio：3D 编辑器 / 整屏展示的内嵌运行时，自带 `--i3d-control-scale` 与 iframe 视口，
 * 不参与主壳的整页缩放，按窗口宽度做断点是设计意图。
 */
const EXEMPT_DIRS = ['homeos/frontend/src/studio']

/**
 * 允许出现的容器名。
 *
 * - `hos-canvas`：画布容器（`.app-shell` / `body`），宽度 = 画布宽度，本站统一的布局断点基准；
 * - `settings-scroll`：设置页滚动区自己声明的更细容器（卡内两列 / 三列切换），
 *   语义是「这块面板有多宽」，与画布宽度是两个层次，保留。
 */
const ALLOWED_CONTAINER_NAMES = new Set(['hos-canvas', 'settings-scroll'])
/**
 * 豁免文件（相对仓库根）。
 *
 * scaled-viewport.css：写的是 `.viewport-frame`（容器的**祖先**）与 `.app-shell--scaling`
 * 自身。容器查询只能命中容器的后代，对容器自身/祖先无效，只能继续用媒体查询。
 */
const BASELINE_REL = 'ops/checks/baselines/frontend/canvas-breakpoints-baseline.json'

const WIDTH_CONDITION = /\((?:min|max)-(?:width|inline-size):[^)]*\)|\(\s*(?:width|inline-size)\s*(?:<=|>=|<|>)/i

/** 去掉注释，避免把文档里的示例当成真实规则 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
}

/** 抓出一个 at-rule 的预头部（到 `{` 为止）与正文，括号配平 */
function atRuleHeads(source, name) {
  const heads = []
  const re = new RegExp(`@${name}\\b`, 'g')
  let match = re.exec(source)
  while (match) {
    const brace = source.indexOf('{', match.index)
    if (brace === -1) break
    let depth = 0
    let end = brace
    for (let i = brace; i < source.length; i++) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    heads.push({ index: match.index, head: source.slice(match.index, brace), body: source.slice(brace + 1, end) })
    match = re.exec(source)
  }
  return heads
}

/**
 * 该块是否只是「文档级」规则（选择器全是 `:root` / `html`）。
 *
 * 用途：`:root` 令牌覆盖（发丝边、控件高度、发光强度）语义上是「触控 / 小屏设备切粗粒度」，
 * 而且 `:root` 不是任何容器的后代 —— 放进 `@container` 会整段静默失效。这些块保留媒体查询。
 */
function isDocumentLevelBlock(body) {
  const selectors = [...body.matchAll(/(?:^|\})\s*([^{}@]+)\{/g)].map((m) => m[1].trim()).filter(Boolean)
  if (selectors.length === 0) return false
  return selectors.every((selector) => /^(:root|html)\b/.test(selector))
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length
}

/**
 * @param {ReturnType<typeof createContext>} ctx
 */
export function audit(ctx) {
  const loaded = readBaseline(join(ctx.repoRoot, BASELINE_REL), BASELINE_REL)
  const allowFiles = new Set(loaded.ok ? (loaded.data.allow ?? []) : [])
  const skipDirs = new Set(['node_modules', 'dist', 'build', '.git'])

  const violations = []
  const documentLevel = []
  let containerQueries = 0

  for (const dir of SCOPE_DIRS) {
    for (const file of ctx.walk(dir, new Set(['.css', '.vue']), skipDirs)) {
      const rel = ctx.rel(file)
      if (EXEMPT_DIRS.some((exempt) => rel.startsWith(exempt))) continue
      const source = stripComments(ctx.text(file))

      for (const { index, head } of atRuleHeads(source, 'container')) {
        const containerName = head.replace(/^@container\s+/, '').split(/[\s(]/)[0]
        if (!containerName || containerName.startsWith('(')) {
          violations.push(
            `${rel}:${lineOf(source, index)} 容器查询必须命名（hos-canvas / settings-scroll）：${head.trim()}`,
          )
        } else if (!ALLOWED_CONTAINER_NAMES.has(containerName)) {
          violations.push(`${rel}:${lineOf(source, index)} 未知容器名 ${containerName}：${head.trim()}`)
        } else if (containerName === 'hos-canvas') {
          containerQueries++
        }
      }

      if (allowFiles.has(rel)) continue

      for (const { index, head, body } of atRuleHeads(source, 'media')) {
        if (!WIDTH_CONDITION.test(head)) continue
        if (isDocumentLevelBlock(body)) {
          documentLevel.push(`${rel}:${lineOf(source, index)}`)
          continue
        }
        violations.push(
          `${rel}:${lineOf(source, index)} 宽度断点仍用 @media（读窗口宽度），应改 @container hos-canvas：${head.trim()}`,
        )
      }

      if (/html:not\(\.hos-canvas-scaled\)/.test(source)) {
        violations.push(`${rel} 仍在使用 html:not(.hos-canvas-scaled) 门控，应直接写 @container hos-canvas`)
      }
    }
  }

  return {
    name: '画布断点守卫',
    summary: `${containerQueries} 个 hos-canvas 容器查询，无窗口宽度断点残留`,
    problems: violations,
    notes: documentLevel.length > 0 ? [`文档级 :root 令牌块保留媒体查询：${documentLevel.length} 处`] : [],
    json: { ok: violations.length === 0, containerQueries, documentLevel, violations },
  }
}

/** 单跑入口。 */
export function cli(argv = process.argv.slice(2)) {
  return report(audit(createContext(join(import.meta.dirname, '../../..'))), { json: argv.includes('--json') })
}

if (isMain(import.meta.url)) process.exit(cli())
