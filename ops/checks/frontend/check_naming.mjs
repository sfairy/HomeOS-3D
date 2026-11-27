#!/usr/bin/env node
/**
 * 命名与目录结构门禁：把「模块化约定」变成可执行检查。
 *
 * 约定（本文件即唯一真源）：
 *
 * N1 禁止「技术形态」目录段
 *    `utils/` `composables/` `types/` `constants/` `hooks/` `helpers/` `models/`
 *    —— 目录必须表达能力（`engine/` `payment/`），不是文件形态。
 *    例外：`studio/app/shared`、`features/settings/shared` 是分层概念（`app/shared`
 *    在 studio 分层规则里是叶子层），不按形态段处理。
 *
 * N2 禁止形态后缀文件名
 *    `*.util.ts`（说「我是工具」而不是「我做什么」）、`*.internals.ts`（没有宿主文件时
 *    完全失去意义，实测 36 个全部无宿主）。
 *
 * N3 命名风格
 *    前端 `.ts`/`.tsx` 一律 kebab-case；`.vue` 一律 PascalCase；Python 一律 snake_case。
 *
 * N4 barrel 只出现在模块边界
 *    `index.ts` 只允许在 `features` 的域根、`domain` 的模块根、`kernel` 根、`studio` 根、
 *    `packages` 下各包的 `src` 根这一级；模块内部二级目录不许有 barrel。
 *
 * 用法：
 *   node ops/checks/frontend/check_naming.mjs            # 报告
 *   node ops/checks/frontend/check_naming.mjs --json
 */
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { walkFiles } from '../../lib/walk.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const ROOTS = [
  'homeos/frontend/src',
  'homeos-store/frontend/src',
  'homeos-backend-placeholder',
]

/** N1：形态目录段（含用途说明，报错时直接打印）。 */
const FORM_SEGMENTS = new Map([
  ['utils', '技术形态目录：把工具按「是不是工具」分组，而不是按能力'],
  ['composables', '技术形态目录：Vue hook 不是职责分类'],
  ['types', '技术形态目录：类型属于它所描述的模块'],
  ['constants', '技术形态目录：常量属于使用它的能力'],
  ['hooks', '技术形态目录'],
  ['helpers', '技术形态目录'],
  ['models', '技术形态目录'],
])

/** N1 例外：这些 `shared` 是分层概念，不是形态段。 */
const ALLOWED_SEGMENTS = new Set(['studio/app/shared', 'features/settings/shared'])

/** N2：形态后缀。 */
const FORM_SUFFIXES = [
  ['.util.ts', '形态后缀：文件名应表达领域职责，不是「这是工具」'],
  ['.internals.ts', '形态后缀：没有宿主文件时完全失去意义'],
]

/** N4：允许出现 index.ts 的层级（相对 src 的深度 或 具体路径模式）。 */
function isModuleBoundaryIndex(rel) {
  // features/<cap>/index.ts · domain/<mod>/index.ts · kernel/index.ts · studio/index.ts
  if (/^features\/[^/]+\/index\.ts$/.test(rel)) return true
  if (/^domain\/[^/]+\/index\.ts$/.test(rel)) return true
  if (/^kernel\/index\.ts$/.test(rel)) return true
  if (/^studio\/index\.ts$/.test(rel)) return true
  // store 前端：features/<cap>/index.ts
  if (/^features\/[^/]+\/index\.ts$/.test(rel)) return true
  return false
}

/** 明确豁免（每个都要有理由）。 */
const INDEX_EXEMPT = new Map([
  // studio 子域的内部 barrel：studio 是 L3 子系统，其内部分层由 check_frontend_deps 的
  // studio 规则统一守卫（runtime→app 禁向、authoring 只能被 bridge 调用）。这些 barrel 是
  // 该子系统内部的编译单元边界（一条 import 触发整组模块），不是「多一跳转发」的碎片 —— 
  // 实测解散后大量多行 import 失去聚合目标，反而把一个概念拆到十几个说明符里。
  ['studio/app/renderer/registry/index.ts', 'studio 内部编译单元边界'],
  ['studio/app/bridge/scene/index.ts', 'studio 内部编译单元边界'],
  ['studio/app/display/index.ts', 'studio 内部编译单元边界'],
  ['studio/app/editor/home/index.ts', 'studio 内部编译单元边界'],
  ['studio/authoring/export/index.ts', 'studio 内部编译单元边界'],
  ['studio/authoring/interaction/index.ts', 'studio 内部编译单元边界'],
  ['studio/authoring/lights/index.ts', 'studio 内部编译单元边界'],
  ['studio/authoring/materials/index.ts', 'studio 内部编译单元边界'],
  ['studio/authoring/plan/index.ts', 'studio 内部编译单元边界'],
  ['studio/authoring/render/index.ts', 'studio 内部编译单元边界'],
  ['studio/authoring/runtime/index.ts', 'studio 内部编译单元边界'],
  ['studio/authoring/scene-build/index.ts', 'studio 内部编译单元边界'],
  ['studio/authoring/store/index.ts', 'studio 内部编译单元边界'],
  ['studio/authoring/ui/index.ts', 'studio 内部编译单元边界'],
  ['studio/chrome/index.ts', 'studio 内部编译单元边界'],
  ['studio/engine/index.ts', 'studio 内部编译单元边界'],
  ['router/index.ts', '路由表，不是 barrel'],
  ['app/router/index.ts', '路由表，不是 barrel'],
  ['kernel/http/index.ts', '为解 TDZ 有意保留的模块边界'],
  ['features/auth/views/index.ts', '五个认证页聚成一个懒加载 chunk'],
  ['studio/authoring/items/item-model/index.ts', '策略分派链的入口聚合'],
])

export const problems = []
const kebab = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/
const pascal = /^[A-Z][A-Za-z0-9]*$/

for (const root of ROOTS) {
  const rootAbs = resolve(REPO_ROOT, root)
  if (!existsSync(rootAbs)) continue
  for (const fileAbs of walkFiles(rootAbs)) {
    const rel = relative(rootAbs, fileAbs).split('\\').join('/')
    const full = `${root}/${rel}`

    // N1 形态目录
    const segments = rel.split('/')
    for (let i = 0; i < segments.length - 1; i += 1) {
      const seg = segments[i]
      if (!FORM_SEGMENTS.has(seg)) continue
      const prefix = segments.slice(0, i + 1).join('/')
      if ([...ALLOWED_SEGMENTS].some((allowed) => prefix.endsWith(allowed))) continue
      problems.push({
        rule: 'N1',
        file: full,
        detail: `目录段 "${seg}"：${FORM_SEGMENTS.get(seg)}`,
      })
    }

    // N2 形态后缀
    for (const [suffix, why] of FORM_SUFFIXES) {
      if (!rel.endsWith(suffix)) continue
      problems.push({ rule: 'N2', file: full, detail: why })
    }

    // N3 命名风格
    const base = rel.slice(rel.lastIndexOf('/') + 1)
    if (rel.endsWith('.d.ts')) continue
    const stem = base.replace(/\.(ts|tsx|vue|css|mjs)$/, '')
    if (base.endsWith('.vue')) {
      if (!pascal.test(stem)) problems.push({ rule: 'N3', file: full, detail: '.vue 应为 PascalCase' })
    } else if (base.endsWith('.ts') || base.endsWith('.tsx')) {
      if (!kebab.test(stem)) problems.push({ rule: 'N3', file: full, detail: '.ts 应为 kebab-case' })
    }

    // N4 barrel 层级
    if (base === 'index.ts' && !isModuleBoundaryIndex(rel) && !INDEX_EXEMPT.has(rel)) {
      problems.push({ rule: 'N4', file: full, detail: 'index.ts 只允许出现在模块边界' })
    }
  }
}

// 后端：Python snake_case
const backendRoot = resolve(REPO_ROOT, 'homeos/backend/src')
if (existsSync(backendRoot)) {
  for (const fileAbs of walkFiles(backendRoot, { extensions: new Set(['.py']) })) {
    const base = fileAbs.slice(fileAbs.lastIndexOf('/') + 1)
    if (base === '__init__.py') continue
    const stem = base.replace(/\.py$/, '')
    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(stem)) {
      problems.push({ rule: 'N3', file: relative(REPO_ROOT, fileAbs), detail: 'Python 应为 snake_case' })
    }
  }
}

export function audit() {
  const byRule = new Map()
  for (const p of problems) {
    if (!byRule.has(p.rule)) byRule.set(p.rule, [])
    byRule.get(p.rule).push(p)
  }
  return {
    name: '命名与目录结构',
    summary:
      problems.length === 0
        ? '形态目录段 / 形态后缀 / 命名风格 / barrel 层级 全部符合约定'
        : `${problems.length} 处违规`,
    problems: problems.map((p) => `${p.file}: [${p.rule}] ${p.detail}`),
    hints:
      problems.length > 0
        ? ['约定真源见 check_naming.mjs 顶部注释；确需例外时在 INDEX_EXEMPT / ALLOWED_SEGMENTS 登记并写理由。']
        : [],
    json: { count: problems.length, problems },
  }
}

// 直接运行时才打印（被 run_frontend_checks 引入时不产生副作用）
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = audit()
  const json = process.argv.includes('--json')
  if (json) {
    console.log(JSON.stringify(result.json, null, 2))
  } else {
    const byRule = new Map()
    for (const p of problems) {
      if (!byRule.has(p.rule)) byRule.set(p.rule, [])
      byRule.get(p.rule).push(p)
    }
    for (const [rule, list] of [...byRule].sort()) {
      console.log(`\n${rule}（${list.length} 处）`)
      for (const p of list.slice(0, 12)) console.log(`  ${p.file}: ${p.detail}`)
      if (list.length > 12) console.log(`  …另有 ${list.length - 12} 处`)
    }
    console.log(`\n${result.summary}`)
  }
  process.exit(process.argv.includes('--check') && problems.length ? 1 : 0)
}
