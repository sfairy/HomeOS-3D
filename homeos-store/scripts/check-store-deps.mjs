#!/usr/bin/env node
/**
 * homeos-store frontend dependency guard:
 * components|composables|stores|utils ↛ views/**
 *
 * walk / import spec 提取走 `ops/lib/scan.mjs`（与主应用的两个方向门禁同一份实现）：
 * 这里过去自带一份 walk 与更弱的 IMPORT_RE（漏副作用 `import 'x'`、漏 `.tsx`），
 * 统一后 store 侧不再因为「扩展名少一种」而静默漏检。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectImportSpecs, rel, walkSource } from '../../ops/lib/scan.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.resolve(__dirname, '../frontend/src')
const LOWER = new Set(['components', 'composables', 'stores', 'utils'])

/** @type {{ file: string, spec: string }[]} */
const violations = []

for (const file of walkSource(srcRoot)) {
  const relPath = rel(srcRoot, file)
  const top = relPath.split('/')[0]
  if (!LOWER.has(top)) continue
  const text = fs.readFileSync(file, 'utf8')
  for (const { spec } of collectImportSpecs(text)) {
    const hitsViews =
      spec.startsWith('@store/views/') ||
      spec.startsWith('@/views/') ||
      /(^|\/)views\//.test(spec)
    if (hitsViews && (spec.includes('views/') || spec.startsWith('../views') || spec.startsWith('./views'))) {
      violations.push({ file: relPath, spec })
    }
    // relative climb into views
    if (spec.startsWith('.')) {
      const resolved = path.normalize(path.join(path.dirname(file), spec))
      const relRes = rel(srcRoot, resolved)
      if (relRes.startsWith('views/') || relRes === 'views') {
        violations.push({ file: relPath, spec })
      }
    }
  }
}

if (violations.length) {
  console.error(`store dependency violations: ${violations.length}\n`)
  for (const v of violations) {
    console.error(`  ${v.file}\n    ${v.spec}`)
  }
  process.exit(1)
}

console.log('store dependency check: ok')
