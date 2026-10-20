#!/usr/bin/env node
/**
 * 前端域边界门禁：把 README 中的约定变成可执行检查。
 *
 * 规则（详见 homeos/frontend/src/README.md）：
 * 1. views/** 只能经 `@/features/<域>` 或 `@/features/<域>/entry` 使用 feature；
 * 2. feature A 引用 feature B 只能走 B 的域根 barrel；A 不得引用自身 barrel；
 * 3. shared/** 不得引用 stores / composables / components / views / features / layouts；
 * 4. components|stores|composables 不得引用 views / features；
 * 5. 叶子消费者（services、stores、shared/utils、shared/<域>/{utils,constants,types}）
 *    不得 import `@/shared/<域>` 裸 barrel；
 * 6. 根入口不得深引 `@/studio/**`；
 * 7. 禁止 `import Foo from '@/features/<域>'` 默认导入。
 *
 * 用法：node scripts/check-frontend-deps.mjs [--root <src目录>]
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..', 'src')
const ROOT_INDEX = process.argv.indexOf('--root')
const ROOT = ROOT_INDEX > -1 ? path.resolve(process.argv[ROOT_INDEX + 1]) : DEFAULT_ROOT
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.mts', '.vue', '.js', '.mjs'])
const UPPER_LAYERS = ['stores', 'composables', 'components', 'views', 'features', 'layouts']

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (SOURCE_EXTS.has(path.extname(entry.name))) out.push(full)
  }
  return out
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
  /(?:^|[;\n])\s*export\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g,
  /import\(\s*['"]([^'"]+)['"]\s*\)/g,
]

function collectImports(text) {
  const masked = stripComments(text)
  const found = []
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(masked)) !== null) {
      const isDefaultForm = match.length > 2 && match[2] !== undefined && pattern === IMPORT_PATTERNS[0]
      const clause = isDefaultForm ? match[1] : ''
      const specifier = isDefaultForm ? match[2] : match[1]
      if (!specifier) continue
      const line = masked.slice(0, match.index).split('\n').length
      found.push({ clause, specifier, line, index: match.index })
    }
  }
  return found
}

function resolveSpecifier(importerRel, specifier) {
  const clean = specifier.split('?')[0].trim()
  if (!clean) return null
  if (clean.startsWith('@/')) return clean.slice(2)
  if (clean.startsWith('@app/')) return `studio/app/${clean.slice('@app/'.length)}`
  if (clean.startsWith('@runtime/')) return `studio/runtime/${clean.slice('@runtime/'.length)}`
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

function isFeatureBarrel(target) {
  return /^features\/[^/]+$/.test(target)
}

function isFeatureEntry(target) {
  return /^features\/[^/]+\/entry$/.test(target)
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
  const featureMatch = /^features\/([^/]+)\//.exec(rel)
  const importerFeature = featureMatch ? featureMatch[1] : null
  const importerLeaf =
    rel.startsWith('services/') ||
    rel.startsWith('stores/') ||
    rel.startsWith('shared/utils/') ||
    /^shared\/[^/]+\/(utils|constants|types)\//.test(rel)
  const importerRootEntry = rel === 'main.ts'

  for (const item of collectImports(text)) {
    const resolved = resolveSpecifier(rel, item.specifier)
    if (!resolved) continue
    const target = normalizeTarget(resolved)
    const targetFeature = /^features\/([^/]+)/.exec(target)
    const targetDomain = targetFeature ? targetFeature[1] : null

    if (rel.startsWith('views/') && targetDomain) {
      if (!(isFeatureBarrel(target) || isFeatureEntry(target))) {
        errors.push({ line: item.line, rule: 'views→feature-deep', specifier: item.specifier })
      }
    }

    if (importerFeature && targetDomain) {
      if (targetDomain !== importerFeature) {
        if (!isFeatureBarrel(target)) {
          errors.push({ line: item.line, rule: 'feature-cross-deep', specifier: item.specifier })
        }
      } else if (isFeatureBarrel(target)) {
        errors.push({ line: item.line, rule: 'feature-self-barrel', specifier: item.specifier })
      }
    }

    if (rel.startsWith('shared/') && UPPER_LAYERS.some((layer) => target === layer || target.startsWith(`${layer}/`))) {
      errors.push({ line: item.line, rule: 'shared→upper', specifier: item.specifier })
    }

    if (
      (rel.startsWith('components/') || rel.startsWith('stores/') || rel.startsWith('composables/')) &&
      (target === 'views' || target.startsWith('views/') || target.startsWith('features/'))
    ) {
      errors.push({ line: item.line, rule: 'ui-layer→views/features', specifier: item.specifier })
    }

    if (importerLeaf && /^shared\/[^/]+$/.test(target)) {
      errors.push({ line: item.line, rule: 'leaf→shared-barrel', specifier: item.specifier })
    }

    if (importerRootEntry && target.startsWith('studio/')) {
      errors.push({ line: item.line, rule: 'root→studio-deep', specifier: item.specifier })
    }

    if (isFeatureBarrel(target) && isDefaultImport(item.clause)) {
      errors.push({ line: item.line, rule: 'feature-barrel-default-import', specifier: item.specifier })
    }
  }
  return { rel, errors }
}

if (!fs.existsSync(ROOT)) {
  console.error(`check-frontend-deps: root not found: ${ROOT}`)
  process.exit(2)
}

const violations = []
for (const file of walk(ROOT)) {
  const result = checkFile(file)
  for (const error of result.errors) violations.push({ file: result.rel, ...error })
}

if (violations.length > 0) {
  for (const item of violations) {
    console.error(`${item.file}:${item.line} [${item.rule}] ${item.specifier}`)
  }
  console.error(`check-frontend-deps: ${violations.length} violation(s)`)
  process.exit(1)
}

console.log('check-frontend-deps: 0 violation(s)')
