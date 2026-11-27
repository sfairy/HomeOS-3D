#!/usr/bin/env node
/**
 * 修复「指向已合并子模块」的导入说明符。
 *
 * 场景：`@/kernel/constants/entity-state` 里的 `entity-state.ts` 已被合并进
 * `kernel/constants.ts`。恢复出来的旧文件仍写着详细路径，解析不到。
 *
 * 策略：逐级截断说明符末段，直到能解析到真实文件；若该文件是单文件模块
 * （合并产物）或桶文件，就改用它。**只处理解析失败的**，已能解析的一律不动。
 *
 * 用法：
 *   node ops/scripts/codemod/fix-dangling-imports.mjs            # 报告
 *   node ops/scripts/codemod/fix-dangling-imports.mjs --write
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { walkFiles } from '../../lib/walk.mjs'
import { isSourceFile } from './lib/imports.mjs'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const SRC_ROOTS = ['homeos/frontend/src', 'homeos-store/frontend/src']
const WRITE = process.argv.includes('--write')

const EXTS = ['.ts', '.tsx', '.vue', '.css', '/index.ts']

/** 能否解析到真实文件。说明符已带扩展名时（`.vue` / `.css`）按原样判定。 */
function resolves(absBase) {
  if (/\.(vue|css|json)$/.test(absBase)) return existsSync(absBase)
  return EXTS.some((ext) => existsSync(`${absBase}${ext}`))
}

/** 说明符 → 绝对路径基址（不含扩展名）。 */
function toAbs(spec, importerRel) {
  const importerAbs = resolve(REPO_ROOT, importerRel)
  if (spec.startsWith('.')) return resolve(dirname(importerAbs), spec)
  for (const [prefix, base] of [
    ['@app/', 'homeos/frontend/src/studio/app/'],
    ['@runtime/', 'homeos/frontend/src/studio/runtime/'],
    ['@/', 'homeos/frontend/src/'],
  ]) {
    if (!spec.startsWith(prefix)) continue
    return resolve(REPO_ROOT, base, spec.slice(prefix.length))
  }
  return null
}

/** 绝对路径 → 说明符（沿用原风格）。 */
function toSpec(abs, style) {
  const repoRel = abs.slice(REPO_ROOT.length + 1)
  if (style === 'alias') {
    if (repoRel.startsWith('homeos/frontend/src/studio/app/')) {
      return `@app/${repoRel.slice('homeos/frontend/src/studio/app/'.length)}`
    }
    if (repoRel.startsWith('homeos/frontend/src/studio/runtime/')) {
      return `@runtime/${repoRel.slice('homeos/frontend/src/studio/runtime/'.length)}`
    }
    if (repoRel.startsWith('homeos/frontend/src/')) return `@/${repoRel.slice('homeos/frontend/src/'.length)}`
    return repoRel
  }
  return null
}

let fixed = 0
const report = []

for (const root of SRC_ROOTS) {
  if (!existsSync(root)) continue
  for (const fileAbs of walkFiles(root)) {
    const rel = fileAbs.split('\\').join('/')
    if (!isSourceFile(rel)) continue
    const text = readFileSync(rel, 'utf8')
    let next = text
    for (const match of text.matchAll(/(['"])((?:\.\.?\/|@app\/|@runtime\/|@\/)[^'"]+)\1/g)) {
      const [whole, quote, spec] = match
      const abs = toAbs(spec, rel)
      if (!abs || resolves(abs)) continue
      // 逐级截断，找到最近的可用模块
      let candidate = abs
      let found = null
      while (candidate.length > REPO_ROOT.length) {
        const parent = dirname(candidate)
        if (parent === candidate || !parent.startsWith(REPO_ROOT)) break
        candidate = parent
        if (resolves(candidate)) {
          found = candidate
          break
        }
      }
      if (!found) continue
      const style = spec.startsWith('.') ? 'relative' : 'alias'
      let replacement = toSpec(found, style)
      if (!replacement) continue
      // 相对路径：显式带上 ./ 或 ../
      if (style === 'relative' && !replacement.startsWith('.')) {
        replacement = `./${replacement}`
      }
      next = next.replace(whole, `${quote}${replacement}${quote}`)
      report.push(`${rel}: ${spec} → ${replacement}`)
    }
    if (next !== text) {
      fixed += 1
      if (WRITE) writeFileSync(rel, next, 'utf8')
    }
  }
}

for (const line of report) console.log(`  ${line}`)
console.log(`\n${WRITE ? '已改写' : '待改写'} ${fixed} 个文件（${report.length} 处说明符）`)
