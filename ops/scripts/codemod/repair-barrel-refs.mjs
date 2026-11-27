#!/usr/bin/env node
/**
 * 修复「指向已解散 barrel」的导入说明符。
 *
 * 场景：barrel 被删（`x/index.ts`）后，仍有少量 import 指向 `x` 或 `x/index`。
 * 对策（按顺序尝试，全部只做**能解析成功**的改写）：
 * 1. 去掉末尾 `/index`；
 * 2. 若目标目录已不存在（形态目录被压平），把具名导入按符号拆到同域的具体文件；
 * 3. 都不行就报告，不猜。
 *
 * 用法：node ops/scripts/codemod/repair-barrel-refs.mjs [--write]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { walkFiles } from '../../lib/walk.mjs'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const WRITE = process.argv.includes('--write')
const FRONTEND = resolve(REPO_ROOT, 'homeos/frontend/src')
const STORE = resolve(REPO_ROOT, 'homeos-store/frontend/src')
const ROOTS = [FRONTEND, STORE]

const EXTS = ['.ts', '.tsx', '.vue', '/index.ts']

function resolves(abs) {
  if (/\.(vue|css|json)$/.test(abs)) return existsSync(abs)
  return EXTS.some((ext) => existsSync(abs + ext))
}

function toAbs(spec, importerAbs) {
  if (spec.startsWith('.')) return resolve(dirname(importerAbs), spec)
  if (spec.startsWith('@store/')) return resolve(STORE, spec.slice(7))
  if (spec.startsWith('@app/')) return resolve(FRONTEND, 'studio/app', spec.slice(5))
  if (spec.startsWith('@runtime/')) return resolve(FRONTEND, 'studio/runtime', spec.slice(9))
  if (spec.startsWith('@/')) return resolve(FRONTEND, spec.slice(2))
  if (spec.startsWith('@homeos/shared')) return null
  return null
}

function toSpec(targetAbs, importerAbs) {
  const t = targetAbs.replace(/\.(tsx?|vue)$/, '')
  for (const [root, prefix] of [
    [FRONTEND, '@/'],
    [STORE, '@store/'],
  ]) {
    if (!t.startsWith(`${root}/`)) continue
    const rel = relative(root, t).split(sep).join('/')
    if (prefix === '@/') {
      if (rel.startsWith('studio/app/')) return `@app/${rel.slice(11)}`
      if (rel.startsWith('studio/runtime/')) return `@runtime/${rel.slice(15)}`
    }
    return `${prefix}${rel}`
  }
  const r = relative(dirname(importerAbs), t).split(sep).join('/')
  return r.startsWith('.') ? r : `./${r}`
}

/** 目录内 符号→文件 索引。 */
function indexDir(dirAbs) {
  const idx = new Map()
  if (!existsSync(dirAbs)) return idx
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = resolve(d, entry.name)
      if (entry.isDirectory() && entry.name !== 'node_modules') {
        walk(full)
        continue
      }
      if (!/\.(ts|tsx|vue)$/.test(entry.name) || entry.name === 'index.ts') continue
      const text = readFileSync(full, 'utf8')
      for (const m of text.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm)) {
        idx.set(m[1], full)
      }
      for (const m of text.matchAll(/^export\s+(?:type\s+)?\{([^{}]*)\}/gm)) {
        for (const part of m[1].split(',')) {
          const piece = part.trim().replace(/^type\s+/, '')
          if (!piece) continue
          idx.set(piece.split(/\s+as\s+/).pop().trim(), full)
        }
      }
    }
  }
  walk(dirAbs)
  return idx
}

let fixed = 0
const unresolved = []

for (const root of ROOTS) {
  if (!existsSync(root)) continue
  for (const fileAbs of walkFiles(root)) {
    if (!/\.(ts|tsx|vue)$/.test(fileAbs)) continue
    const text = readFileSync(fileAbs, 'utf8')
    let next = text
    for (const m of text.matchAll(/^([ \t]*)import\s+(?:type\s+)?\{([^{}]*)\}\s+from\s+['"]([^'"]+)['"];?[ \t]*$/gm)) {
      const [statement, indent, inner, spec] = m
      const abs = toAbs(spec, fileAbs)
      if (!abs || resolves(abs)) continue

      // 1) 去掉末尾 /index
      if (spec.endsWith('/index')) {
        const trimmed = spec.slice(0, -'/index'.length)
        const absTrim = toAbs(trimmed, fileAbs)
        if (absTrim && resolves(absTrim)) {
          next = next.replace(statement, statement.replace(spec, trimmed))
          fixed += 1
          continue
        }
      }

      // 2) 目标目录已不存在 → 按符号拆到同域具体文件
      const orphanDir = dirname(abs)
      const searchDir = existsSync(orphanDir) ? orphanDir : dirname(orphanDir)
      const idx = indexDir(searchDir)
      const groups = new Map()
      let ok = true
      for (const part of inner.split(',')) {
        const piece = part.trim()
        if (!piece) continue
        const name = piece.replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim()
        const target = idx.get(name)
        if (!target) {
          ok = false
          break
        }
        const out = toSpec(target, fileAbs)
        if (!groups.has(out)) groups.set(out, [])
        groups.get(out).push(piece)
      }
      if (!ok) {
        unresolved.push(`${relative(REPO_ROOT, fileAbs)}: ${spec}`)
        continue
      }
      next = next.replace(
        statement,
        [...groups].map(([out, names]) => `${indent}import { ${names.join(', ')} } from '${out}'`).join('\n'),
      )
      fixed += 1
    }
    if (next !== text && WRITE) writeFileSync(fileAbs, next, 'utf8')
  }
}

for (const u of unresolved) console.log(`  未能修复 ${u}`)
console.log(`${WRITE ? '已修复' : '待修复'} ${fixed} 处${unresolved.length ? `，${unresolved.length} 处需人工` : ''}`)
