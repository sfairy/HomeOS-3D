#!/usr/bin/env node
/**
 * 对比度审计（WCAG 2.1）：解析令牌文件里的文字/表面令牌配对，按作用域（深色 :root / 浅色
 * data-theme=light）解 var() 链后计算对比度，标出正文 <4.5:1、大字号/图形 <3:1 的项。
 *
 * 用法：`node ops/ui-audit/contrast-audit.mjs [--json]`
 * 产出：reports/contrast.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { blankComments, parseCssColor, composite, contrast, writeJson } from './lib/scan.mjs'
import { REPO_ROOT, OUT_DIR } from './targets.mjs'

const asJson = process.argv.includes('--json')

/** 待审计的令牌文件：路径 + 文字令牌前缀 + 表面令牌名。 */
const FILES = [
  {
    label: 'homeos 主控制设计系统',
    file: path.join(REPO_ROOT, 'homeos/frontend/src/assets/styles/hos-design-system.css'),
    textPrefixes: ['--hos-text-'],
    surfaces: ['--hos-surface-0', '--hos-surface-1', '--hos-surface-2', '--hos-surface-3', '--hos-surface-panel', '--hos-surface-panel-hover'],
    fallbackBg: '#080d18',
    lightFallbackBg: '#f1f5f9',
  },
  {
    label: 'homeos 全局令牌（main.css）',
    file: path.join(REPO_ROOT, 'homeos/frontend/src/assets/styles/main.css'),
    textPrefixes: ['--text-'],
    surfaces: ['--panel-bg', '--panel-bg-heavy', '--surface-bg', '--bg-depth-1', '--bg-depth-2'],
    fallbackBg: '#000000',
  },
  {
    label: 'homeos-store 商店令牌',
    file: path.join(REPO_ROOT, 'homeos-store/frontend/public/static/theme.css'),
    textPrefixes: ['--hb-ink', '--hb-muted'],
    surfaces: ['--hb-bg', '--hb-surface', '--hb-surface-soft', '--hb-surface-raised', '--hb-field'],
    fallbackBg: '#050912',
  },
]

/** 解析成 scopes：selector → Map<name,value>。'root' 为无媒体/无异味的 :root。 */
function parseScopes(css) {
  const cleaned = blankComments(css)
  const scopes = new Map()
  const stack = []
  let bufStart = 0
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i]
    if (c === '{') {
      const selector = cleaned.slice(bufStart, i).trim().replace(/\s+/g, ' ')
      stack.push({ selector, start: i + 1, mergeInto: null, depth: stack.length })
      bufStart = i + 1
    } else if (c === '}') {
      const frame = stack.pop()
      if (frame) {
        const body = cleaned.slice(frame.start, i)
        const key = frame.selector || 'anonymous'
        const isLight = /data-theme=['"]light['"]/.test(key)
        const scopeKey = isLight ? 'light' : /^:root$/.test(key) ? 'root' : null
        if (scopeKey) {
          const map = scopes.get(scopeKey) || new Map()
          const re = /(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+);/g
          for (const m of body.matchAll(re)) map.set(m[1], m[2].trim())
          scopes.set(scopeKey, map)
        }
      }
      bufStart = i + 1
    }
  }
  return scopes
}

/** 解 var() 链到最终字面量。 */
function resolve(name, scope, seen = new Set()) {
  if (!scope.has(name) || seen.has(name)) return null
  seen.add(name)
  let value = scope.get(name)
  let guard = 0
  while (/var\(/.test(value) && guard++ < 12) {
    value = value.replace(/var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,\s*([^)]*))?\)/g, (_, ref, fallback) => {
      const resolved = resolve(ref, scope, new Set(seen))
      return resolved ?? (fallback?.trim() ?? '')
    })
  }
  return value
}

/** 从可能是渐变的值里取最后一个实体颜色。 */
function extractColor(value) {
  if (!value) return null
  const colors = value.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)
  if (!colors) return null
  return colors[colors.length - 1]
}

const report = { generatedAt: new Date().toISOString(), files: [] }

for (const spec of FILES) {
  if (!fs.existsSync(spec.file)) continue
  const scopes = parseScopes(fs.readFileSync(spec.file, 'utf8'))
  const entry = { label: spec.label, file: path.relative(REPO_ROOT, spec.file), scopes: {} }
  for (const [scopeKey, scope] of scopes) {
    // 浅色作用域里的半透明表面必须合成到浅色底，否则会把「浅底深字」误判成低对比
    const base = scopeKey === 'light' ? spec.lightFallbackBg ?? spec.fallbackBg : spec.fallbackBg
    const bgFallback = parseCssColor(base)
    const textNames = [...scope.keys()].filter((n) => spec.textPrefixes.some((p) => n === p || n.startsWith(p)))
    const rows = []
    for (const surfaceName of spec.surfaces) {
      const sRaw = resolve(surfaceName, scope)
      const sHex = extractColor(sRaw)
      let bg = sHex ? parseCssColor(sHex) : null
      if (!bg) bg = bgFallback
      else if (bg.a < 1) bg = composite(bg, bgFallback)
      if (!bg) continue
      for (const textName of textNames) {
        const tRaw = resolve(textName, scope)
        const tHex = extractColor(tRaw)
        let fg = tHex ? parseCssColor(tHex) : null
        if (!fg) continue
        if (fg.a < 1) fg = composite(fg, bg)
        const ratio = contrast(fg, bg)
        rows.push({
          text: textName,
          surface: surfaceName,
          ratio: Number(ratio.toFixed(2)),
          aa: ratio >= 4.5,
          aaLarge: ratio >= 3,
        })
      }
    }
    const fails = rows.filter((r) => !r.aa)
    const largeFails = rows.filter((r) => !r.aaLarge)
    entry.scopes[scopeKey] = {
      pairs: rows.length,
      failBody: fails.length,
      failLarge: largeFails.length,
      worst: rows.sort((a, b) => a.ratio - b.ratio).slice(0, 12),
      failsSample: fails.sort((a, b) => a.ratio - b.ratio).slice(0, 20),
    }
  }
  report.files.push(entry)
}

writeJson(`${OUT_DIR}/contrast.json`, report)
if (asJson) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
else {
  for (const f of report.files) {
    console.log(`\n${f.label}  (${f.file})`)
    for (const [scope, s] of Object.entries(f.scopes)) {
      console.log(`  [${scope}] 配对 ${s.pairs}：正文不达 AA ${s.failBody} 项，图形/大字号不达 3:1 ${s.failLarge} 项`)
      for (const r of s.worst.slice(0, 5)) console.log(`      ${r.ratio.toFixed(2)}  ${r.text} on ${r.surface}`)
    }
  }
}
