#!/usr/bin/env node
/**
 * Main-app (non-studio) dependency direction guard.
 *
 * Rules:
 * - components|stores|utils|composables ↛ @/views/** and ↛ @/features/**
 * - utils ↛ @/composables|@/stores|@/components  (whitelist shrink-only)
 * - composables ↛ @/components  (whitelist shrink-only; warn-level via allowlist)
 *
 * Exit 1 on violations outside whitelist.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.resolve(__dirname, '../src')

/** @type {Set<string>} paths relative to src/ — must stay empty (shrink-only). */
const UTILS_LAYER_WHITELIST = new Set([])

/** @type {Set<string>} */
const COMPOSABLES_COMPONENTS_WHITELIST = new Set([
  'composables/shell/useFloatingHub.ts',
])

const IMPORT_RE = /(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g

/** @type {{ file: string, rule: string, spec: string }[]} */
const violations = []

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'studio') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|vue|js|mjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

function relSrc(absPath) {
  return path.relative(srcRoot, absPath).split(path.sep).join('/')
}

function under(rel, prefix) {
  return rel === prefix || rel.startsWith(`${prefix}/`)
}

function isPureReexport(text) {
  const body = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .trim()
  if (!body) return false
  return body.split(/\n+/).every((line) => {
    const t = line.trim()
    return !t || /^export\s+\*\s+from\s+['"].+['"]\s*;?$/.test(t)
  })
}

function checkFile(file) {
  const rel = relSrc(file)
  if (under(rel, 'studio')) return
  const text = fs.readFileSync(file, 'utf8')
  // Compat barrels that only re-export are allowed during migration.
  if (isPureReexport(text)) return
  let match
  IMPORT_RE.lastIndex = 0
  while ((match = IMPORT_RE.exec(text))) {
    const spec = match[1]
    if (!spec.startsWith('@/')) continue

    if (
      (under(rel, 'components') ||
        under(rel, 'stores') ||
        under(rel, 'utils') ||
        under(rel, 'composables')) &&
      (spec.startsWith('@/views/') || spec.startsWith('@/features/'))
    ) {
      violations.push({
        file: rel,
        rule: 'lower layers must not import views/features',
        spec,
      })
    }

    if (
      under(rel, 'utils') &&
      (spec.startsWith('@/composables/') ||
        spec.startsWith('@/stores/') ||
        spec.startsWith('@/components/'))
    ) {
      if (!UTILS_LAYER_WHITELIST.has(rel)) {
        violations.push({
          file: rel,
          rule: 'utils must not import composables/stores/components',
          spec,
        })
      }
    }

    if (under(rel, 'composables') && spec.startsWith('@/components/')) {
      if (!COMPOSABLES_COMPONENTS_WHITELIST.has(rel)) {
        violations.push({
          file: rel,
          rule: 'composables must not import components',
          spec,
        })
      }
    }
  }
}

for (const file of walk(srcRoot)) {
  checkFile(file)
}

if (violations.length) {
  console.error(`frontend dependency violations: ${violations.length}\n`)
  for (const v of violations.slice(0, 80)) {
    console.error(`  ${v.file}\n    [${v.rule}] ${v.spec}`)
  }
  if (violations.length > 80) {
    console.error(`  … and ${violations.length - 80} more`)
  }
  process.exit(1)
}

console.log(
  `frontend dependency check: ok (utils whitelist ${UTILS_LAYER_WHITELIST.size}, composables→components whitelist ${COMPOSABLES_COMPONENTS_WHITELIST.size})`,
)
