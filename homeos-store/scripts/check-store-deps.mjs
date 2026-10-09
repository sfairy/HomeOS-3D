#!/usr/bin/env node
/**
 * homeos-store frontend dependency guard:
 * components|composables|stores|utils ↛ views/**
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.resolve(__dirname, '../frontend/src')
const IMPORT_RE = /(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g
const LOWER = new Set(['components', 'composables', 'stores', 'utils'])

/** @type {{ file: string, spec: string }[]} */
const violations = []

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|vue|js|mjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

for (const file of walk(srcRoot)) {
  const rel = path.relative(srcRoot, file).split(path.sep).join('/')
  const top = rel.split('/')[0]
  if (!LOWER.has(top)) continue
  const text = fs.readFileSync(file, 'utf8')
  let match
  IMPORT_RE.lastIndex = 0
  while ((match = IMPORT_RE.exec(text))) {
    const spec = match[1]
    const hitsViews =
      spec.startsWith('@store/views/') ||
      spec.startsWith('@/views/') ||
      /(^|\/)views\//.test(spec)
    if (hitsViews && (spec.includes('views/') || spec.startsWith('../views') || spec.startsWith('./views'))) {
      violations.push({ file: rel, spec })
    }
    // relative climb into views
    if (spec.startsWith('.')) {
      const resolved = path.normalize(path.join(path.dirname(file), spec))
      const relRes = path.relative(srcRoot, resolved).split(path.sep).join('/')
      if (relRes.startsWith('views/') || relRes === 'views') {
        violations.push({ file: rel, spec })
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
