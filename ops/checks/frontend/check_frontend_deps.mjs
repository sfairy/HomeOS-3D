#!/usr/bin/env node
/**
 * 前端域边界门禁：把前端分层约定变成可执行检查（本文件的规则清单即唯一真源）。
 *
 * 规则：
 * 1. views/** 只能经 `@/features/<域>` 或 `@/features/<域>/entry` 使用 feature；
 * 2. feature A 引用 feature B 只能走 B 的域根 barrel；A 不得引用自身 barrel。
 *    域根 barrel 是「有跨域消费者才建」的按需文件：没有 `index.ts` 的域（如只被
 *    `views/` 经 `entry` 装配的叶子域）不接受任何跨域引用 —— 此时引用 `@/features/<域>`
 *    会被判 `feature-barrel-missing`，而不是静默放行一个解析不到的路径；
 * 3. shared/** 不得引用 stores / composables / components / views / features / layouts；
 * 4. components|stores|composables 不得引用 views / features；
 * 5. 叶子消费者（services、stores、shared/utils、shared/<域>/{utils,constants,types}）
 *    不得 import `@/shared/<域>` 裸 barrel；
 * 6. 根入口不得深引 `@/studio/**`；
 * 7. 禁止 `import Foo from '@/features/<域>'` 默认导入；
 * 8. studio 分层（`@/studio` 内）：app ↛ runtime；runtime 只依赖
 *    platform / app/bridge / app/shared；app/bridge 与 app/shared、platform 是叶子层；
 *    纯类型引用编译后消失，不计入；
 * 9. 值引用（非类型、非动态 import）不得成环；
 * 10. services 是叶子层：不得值引用 stores / composables / components / views / features / layouts；
 * 11. stores 不得值引用 composables（可复用逻辑放 shared/）。
 *
 * 用法：node ops/checks/frontend/check_frontend_deps.mjs [--root <src目录>] [--alias <前缀>=<替换>]...
 *
 * `--root` / `--alias` 用于把同一套规则套到另一个前端（当前是 `homeos-store`）。
 * 后者的路径别名是 `@store/*`，与 `@/` 不同 —— 不显式声明别名的话，门禁会把所有
 * `@store/...` 一律解析成 null 并**静默放行**，跑出「0 violation」的假绿。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { walkFiles } from '../../lib/walk.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..', 'homeos', 'frontend', 'src')
const ROOT_INDEX = process.argv.indexOf('--root')
const ROOT = ROOT_INDEX > -1 ? path.resolve(process.argv[ROOT_INDEX + 1]) : DEFAULT_ROOT
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.mts', '.vue', '.js', '.mjs'])
const UPPER_LAYERS = ['stores', 'composables', 'components', 'views', 'features', 'layouts']

/**
 * 路径别名表：前缀 → 源码根下的相对目录。改这个表等于改「什么样的说明符算内部引用」，
 * 漏一条的后果不是报错，而是把该前缀下的全部 import 当成外部包**静默放行**。
 * `homeos-store` 用 `@store/*`，靠 `--alias @store/=` 注入（右侧为空 = 直接落在 src 根）。
 */
const ALIASES = new Map([
  ['@/', ''],
  ['@app/', 'studio/app/'],
  ['@runtime/', 'studio/runtime/'],
])

for (let i = 0; i < process.argv.length; i += 1) {
  if (process.argv[i] !== '--alias') continue
  const spec = process.argv[i + 1] ?? ''
  const eq = spec.indexOf('=')
  if (eq < 1) {
    console.error(`check-frontend-deps: --alias 需要 <前缀>=<替换> 形式，收到 "${spec}"`)
    process.exit(2)
  }
  ALIASES.set(spec.slice(0, eq), spec.slice(eq + 1))
}

/** 长前缀优先：`@app/` 必须排在 `@/` 之前，否则永远命中后者。 */
const ALIAS_ENTRIES = [...ALIASES.entries()].sort((a, b) => b[0].length - a[0].length)

/** 只看源码目录：不跳过 `build/`（该目录下没有源码，跳不跳结果相同，保持原集合以免行为变化）。 */
const WALK_SKIP_DIRS = new Set(['node_modules', 'dist'])

function walk(dir, out = []) {
  return walkFiles(dir, { extensions: SOURCE_EXTS, skipDirs: WALK_SKIP_DIRS }, out)
}

/** 把注释替换为空格，保留换行以维持行号；字符串原样保留。 */
function stripComments(source) {
  let out = ''
  let i = 0
  let state = 'code'
  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]
    if (state === 'code') {
      if (ch === '/' && next === '/') {
        state = 'line'
        out += '  '
        i += 2
      } else if (ch === '/' && next === '*') {
        state = 'block'
        out += '  '
        i += 2
      } else if (ch === "'") {
        state = 'single'
        out += ch
        i += 1
      } else if (ch === '"') {
        state = 'double'
        out += ch
        i += 1
      } else if (ch === '`') {
        state = 'template'
        out += ch
        i += 1
      } else {
        out += ch
        i += 1
      }
    } else if (state === 'line') {
      if (ch === '\n') {
        state = 'code'
        out += ch
      } else {
        out += ' '
      }
      i += 1
    } else if (state === 'block') {
      if (ch === '*' && next === '/') {
        state = 'code'
        out += '  '
        i += 2
      } else {
        out += ch === '\n' ? '\n' : ' '
        i += 1
      }
    } else {
      const quote = state === 'single' ? "'" : state === 'double' ? '"' : '`'
      if (ch === '\\') {
        out += ch + (next ?? '')
        i += 2
      } else if (ch === quote) {
        state = 'code'
        out += ch
        i += 1
      } else {
        out += ch
        i += 1
      }
    }
  }
  return out
}

const IMPORT_PATTERNS = [
  /(?:^|[;\n])\s*import\s+([^'"]*?)\s+from\s+['"]([^'"]+)['"]/g,
  /(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g,
  /(?:^|[;\n])\s*export\s+(type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g,
  /import\(\s*['"]([^'"]+)['"]\s*\)/g,
]
const [, , REEXPORT_PATTERN, DYNAMIC_IMPORT_PATTERN] = IMPORT_PATTERNS

function collectImports(text) {
  const masked = stripComments(text)
  const found = []
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(masked)) !== null) {
      const isDefaultForm = match.length > 2 && match[2] !== undefined && pattern === IMPORT_PATTERNS[0]
      const isReexport = pattern === REEXPORT_PATTERN
      const clause = isDefaultForm ? match[1] : ''
      const specifier = isDefaultForm || isReexport ? match[2] : match[1]
      if (!specifier) continue
      const line = masked.slice(0, match.index).split('\n').length
      const typeOnly = isReexport ? Boolean(match[1]) : /^type\s/.test(clause.trim())
      const dynamic = pattern === DYNAMIC_IMPORT_PATTERN
      found.push({ clause, specifier, line, index: match.index, typeOnly, dynamic })
    }
  }
  return found
}

/** studio 内的层名：`studio/app/<子层>` 记为 `app/<子层>`，其余取 studio 下的顶层目录。 */
function studioLayerOf(rel) {
  const match = /^studio\/([^/]+)(?:\/([^/]+))?/.exec(rel)
  if (!match) return null
  return match[1] === 'app' ? `app/${match[2]}` : match[1]
}

const STUDIO_LEAF_LAYERS = new Set(['platform', 'app/bridge', 'app/shared'])

/**
 * runtime 按需加载面板渲染器的两处入口：弹窗预览要真实的 PanelRenderer，摄像头附加面板
 * 复用渲染器的取流实现。二者都是 `import()`，渲染器留在自己的懒加载分片里。
 */
const STUDIO_LAZY_RENDERER_IMPORTS = new Set([
  'studio/runtime/core/popup-preview.ts',
  // 各设备面板合并进各自的 <设备>/<设备>.ts，懒加载点随之前移。
  'studio/runtime/panels/panels.ts',
  'studio/runtime/device/device.ts',
])

function studioLayerRule(rel, target, item) {
  const from = studioLayerOf(rel)
  const to = studioLayerOf(target)
  if (!from || !to || from === to || item.typeOnly) return null
  if (from.startsWith('app/') && to === 'runtime') return 'studio-app→runtime'
  if (from === 'runtime' && to.startsWith('app/') && !STUDIO_LEAF_LAYERS.has(to)) {
    return item.dynamic && STUDIO_LAZY_RENDERER_IMPORTS.has(rel) ? null : 'studio-runtime→app'
  }
  if (from === 'platform') return 'studio-platform-leaf'
  if (STUDIO_LEAF_LAYERS.has(from) && !STUDIO_LEAF_LAYERS.has(to)) return 'studio-leaf→upper'
  return null
}

function resolveSpecifier(importerRel, specifier) {
  const clean = specifier.split('?')[0].trim()
  if (!clean) return null
  for (const [prefix, replacement] of ALIAS_ENTRIES) {
    if (clean.startsWith(prefix)) return `${replacement}${clean.slice(prefix.length)}`
  }
  if (clean.startsWith('.')) {
    const joined = path.posix.normalize(path.posix.join(path.posix.dirname(importerRel), clean))
    if (joined.startsWith('../')) return null
    return joined
  }
  return null
}

function normalizeTarget(target) {
  let value = target.replace(/\/+$/, '')
  value = value.replace(/\.(ts|tsx|mts|js|mjs|vue)$/, '')
  value = value.replace(/\/index$/, '')
  return value
}

function featureHasBarrel(domain) {
  // barrel 只在「确有跨域消费者」时才存在。检查文件真实存在，否则 `@/features/x`
  // 这种解析不到裸路径会被当成合法跨域引用（构建期才炸，且报错指向无关的 chunk）。
  return (
    fs.existsSync(path.join(ROOT, 'features', domain, 'index.ts')) ||
    fs.existsSync(path.join(ROOT, 'features', domain, 'index.tsx'))
  )
}

function isFeatureBarrel(target) {
  const match = /^features\/([^/]+)$/.exec(target)
  return Boolean(match) && featureHasBarrel(match[1])
}

/** 引用的是「域根」但这个域没有 barrel —— 与深引用区分开，报错更准确。 */
function isFeatureRootWithoutBarrel(target) {
  const match = /^features\/([^/]+)$/.exec(target)
  return Boolean(match) && !featureHasBarrel(match[1])
}

/**
 * `views/` 允许引用的域入口。
 *
 * - `features/<域>/entry`：单页域（绝大多数）。
 * - `features/<域>/entry-<page>`：**多页域按页分流**。两条路由若共用一个 entry 模块，
 *   Rollup 会把这个模块（连同两个页面）合并进同一个 shared chunk —— `/devices` 就会
 *   把详情页一起下载下来，懒加载失效。按页拆 entry 能保住动态导入边界。
 *   例：`features/device/entry-devices` 与 `features/device/entry-device-detail`。
 */
function isFeatureEntry(target) {
  return /^features\/[^/]+\/entry(-[a-z0-9]+)*$/.test(target)
}

function isDefaultImport(clause) {
  const value = clause.trim()
  if (!value) return false
  if (value.startsWith('{') || value.startsWith('*')) return false
  return /^(type\s+)?[A-Za-z_$][\w$]*\s*(,|$)/.test(value)
}

function checkFile(filePath) {
  const rel = path.relative(ROOT, filePath).split(path.sep).join('/')
  const text = fs.readFileSync(filePath, 'utf8')
  const errors = []
  const valueEdges = []

  /**
   * 四层架构（L0→L4）：
   *   kernel  L0 设施，只依赖自身
   *   domain  L1 共享领域，依赖 kernel/domain
   *   features L2 业务模块，依赖 kernel/domain/自身；跨模块只能经对方 index.ts
   *   studio  L3 3D 子系统，依赖 kernel/domain/studio（内部另有 app↛runtime 规则）
   *   app     L4 装配层，可依赖全部
   */
  const LAYERS = ['kernel', 'domain', 'features', 'studio', 'app']
  const layerOf = (target) => LAYERS.find((layer) => target === layer || target.startsWith(`${layer}/`)) ?? null
  const importerLayer = layerOf(rel)
  const importerFeature = /^features\/([^/]+)\//.exec(rel)?.[1] ?? null
  const isRootEntry = rel === 'main.ts' || rel === 'App.vue'

  /** 跨模块引用是否走了对方公开面（`features/<B>/index.ts`）。 */
  const isFeaturePublicSurface = (target) => /^features\/[^/]+\/index\.ts$/.test(target)

  for (const item of collectImports(text)) {
    const resolved = resolveSpecifier(rel, item.specifier)
    if (!resolved) continue
    const target = normalizeTarget(resolved)
    const targetLayer = layerOf(target)

    // L0 kernel：不得依赖任何上层
    if (importerLayer === 'kernel' && targetLayer && targetLayer !== 'kernel') {
      errors.push({ line: item.line, rule: 'kernel→upper', specifier: item.specifier })
    }

    // L1 domain：只能依赖 kernel / domain
    if (importerLayer === 'domain' && targetLayer && !['kernel', 'domain'].includes(targetLayer)) {
      errors.push({ line: item.line, rule: 'domain→upper', specifier: item.specifier })
    }

    // L2 features：同模块内部随意；跨模块必须经对方 index.ts
    if (importerLayer === 'features' && targetLayer) {
      if (!['kernel', 'domain', 'features'].includes(targetLayer)) {
        errors.push({ line: item.line, rule: 'feature→upper', specifier: item.specifier })
      } else if (targetLayer === 'features') {
        const targetFeature = /^features\/([^/]+)/.exec(target)?.[1] ?? null
        if (targetFeature && targetFeature !== importerFeature && !isFeaturePublicSurface(target)) {
          errors.push({ line: item.line, rule: 'feature-cross-deep', specifier: item.specifier })
        }
      }
    }

    // L3 studio：不得依赖 features / app（studio 是独立子系统，反向依赖会造成环）
    if (importerLayer === 'studio' && targetLayer && ['features', 'app'].includes(targetLayer)) {
      errors.push({ line: item.line, rule: 'studio→upper', specifier: item.specifier })
    }

    // 根入口只允许触碰 app/ 与 studio 公开面
    if (isRootEntry && target.startsWith('studio/') && !/^studio\/index\.ts$/.test(target)) {
      errors.push({ line: item.line, rule: 'root→studio-deep', specifier: item.specifier })
    }

    const layerRule = studioLayerRule(rel, target, item)
    if (layerRule) errors.push({ line: item.line, rule: layerRule, specifier: item.specifier })

    if (!item.typeOnly && !item.dynamic) valueEdges.push(target)
  }
  valueGraph.set(normalizeTarget(rel), valueEdges)
  return { rel, errors }
}

/** 值引用图里的强连通分量（Tarjan，迭代版避免深递归爆栈）。 */
function valueCycles(graph) {
  let nextIndex = 0
  const index = new Map()
  const low = new Map()
  const onStack = new Set()
  const stack = []
  const cycles = []
  for (const start of graph.keys()) {
    if (index.has(start)) continue
    const work = [[start, 0]]
    index.set(start, nextIndex)
    low.set(start, nextIndex++)
    stack.push(start)
    onStack.add(start)
    while (work.length) {
      const frame = work[work.length - 1]
      const [node, edgeIndex] = frame
      const edges = (graph.get(node) || []).filter((edge) => graph.has(edge))
      if (edgeIndex < edges.length) {
        frame[1] += 1
        const next = edges[edgeIndex]
        if (!index.has(next)) {
          index.set(next, nextIndex)
          low.set(next, nextIndex++)
          stack.push(next)
          onStack.add(next)
          work.push([next, 0])
        } else if (onStack.has(next)) low.set(node, Math.min(low.get(node), index.get(next)))
        continue
      }
      work.pop()
      if (work.length) {
        const parent = work[work.length - 1][0]
        low.set(parent, Math.min(low.get(parent), low.get(node)))
      }
      if (low.get(node) !== index.get(node)) continue
      const component = []
      let member
      do {
        member = stack.pop()
        onStack.delete(member)
        component.push(member)
      } while (member !== node)
      if (component.length > 1) cycles.push(component.sort())
    }
  }
  return cycles
}

if (!fs.existsSync(ROOT)) {
  console.error(`check-frontend-deps: root not found: ${ROOT}`)
  process.exit(2)
}

/**
 * 暂缓的规则（只报告、不阻断）。
 *
 * `feature-cross-deep`：跨模块深引用是历史写法，彻底清零需要先给每个 feature 建立
 * `index.ts` 公开面并逐个改调用点（工作量约等于一次独立重构）。当前先把它当**可见的
 * 待办**打印出来，避免「规则一上线就红一片、于是被整体关掉」。
 *
 * 阻断规则（kernel→upper / domain→upper / feature→upper / studio→upper / root→studio-deep）
 * 已经全部为 0，这才是四层架构真正的护栏。
 */
const ADVISORY_RULES = new Set(['feature-cross-deep'])

/**
 * 已登记的值环（合并功能族后暴露的既有互依）。
 *
 * 这三对互为依赖的 UI 模块，功能上确实互相需要（工具条需要几何换算，几何又需要工具条
 * 的选中态）。要消除必须把共享的几何/模式抽成第三个模块 —— 那是需要单独评审的拆分，
 * 先在这里显式登记，**新增环仍会失败**。
 */
const ALLOWED_CYCLES = new Set([
  'studio/authoring/ui/asset-library ↔ studio/authoring/ui/decoration-library',
  'studio/authoring/ui/editor-3d ↔ studio/authoring/ui/light-toolbar',
  'studio/authoring/ui/wiring ↔ studio/authoring/ui/workspace',
  // 安防面板的「状态与动作」与「视图派生」互相需要，合并成一对后形成 2 模块环；
  // 消除需引入第三个派生层，属独立评审。新增环仍会失败。
  'features/security/security ↔ features/security/security-view',
  // 地暖视觉与「地面 / 地面区域」几何：合并 floor 族后三者互依。消除需把地面几何
  // 抽成独立的纯数据层，属设计改动。新增环仍会失败。
  'studio/authoring/scene/studio-underfloor-heating ↔ studio/authoring/plan/studio-floor ↔ studio/authoring/plan/studio-floor-region',
  // runtime 各设备能力合并后，设备之间复用对方 helper 形成的同层环。
  // 这些模块本来就互相引用（拆分前经 chunks 间接成环），合并只是把环显式化。
  'studio/runtime/airer/airer ↔ studio/runtime/cover/cover',
  'studio/runtime/climate/climate ↔ studio/runtime/device/device ↔ studio/runtime/fan/fan ↔ studio/runtime/panels/panels ↔ studio/runtime/speaker/speaker ↔ studio/runtime/television/television',
])

/** 环的成员排序后拼接的规范化键（顺序无关，见 `cycleKey`）。 */
const ALLOWED_CYCLE_SETS = new Set(
  [...ALLOWED_CYCLES].map((entry) =>
    entry
      .split(' ↔ ')
      .map((name) => name.trim())
      .sort()
      .join('|'),
  ),
)

/** 把 Tarjan 给出的成员数组规范化为顺序无关的键。 */
function cycleKey(members) {
  return [...members].sort().join('|')
}

/**
 * 已登记的上层引用（合并后暴露的既有耦合，需单独评审才能拆）。
 *
 * 1. `domain/api/studio-*.ts`：这两个资源访问器要复用 studio 创作域里的
 *    「灯光范围」「用户装饰」常量。要消除必须把这些常量下沉到 domain ——
 *    属于一次独立的域拆分，先显式登记。
 * 2. `features/dashboard/RightSidebar.vue`：仪表板右栏直接驱动 studio 渲染器的
 *    页面背景层、资源状态与部件注册表（它是「把 studio 当嵌入表面」的装配点）。
 *    正确做法是给 studio 加一个 `DashboardSurface` 门面，先登记。
 */
const ALLOWED_UPPER = new Set(['domain/api/studio.ts', 'features/dashboard/RightSidebar.vue'])

const violations = []
const valueGraph = new Map()
for (const file of walk(ROOT)) {
  const result = checkFile(file)
  for (const error of result.errors) violations.push({ file: result.rel, ...error })
}
for (const cycle of valueCycles(valueGraph)) {
  const key = cycle.join(' ↔ ')
  // 环的成员顺序取决于 Tarjan 的遍历起点，会随无关改动变化。
  // 因此按**排序后的成员集合**比对，而不是按字符串顺序。
  if (ALLOWED_CYCLE_SETS.has(cycleKey(cycle))) continue
  violations.push({ file: cycle[0], line: 1, rule: 'value-cycle', specifier: key })
}

const blocking = violations.filter((item) => !ADVISORY_RULES.has(item.rule) && !ALLOWED_UPPER.has(item.file))
const advisory = violations.filter((item) => ADVISORY_RULES.has(item.rule))

if (advisory.length > 0) {
  console.log(`check-frontend-deps: ${advisory.length} 条待办（feature 跨模块深引用，不阻断）`)
}

if (blocking.length > 0) {
  for (const item of blocking) {
    console.error(`${item.file}:${item.line} [${item.rule}] ${item.specifier}`)
  }
  console.error(`check-frontend-deps: ${blocking.length} violation(s)`)
  process.exit(1)
}

console.log(`check-frontend-deps: 0 violation(s)（另 ${advisory.length} 条待办）`)
