#!/usr/bin/env node
/**
 * 清理合并文件里残留的「次级 @file 头注释」。
 *
 * 问题：机械合并把多个源文件拼到一起，每个源文件开头都有
 *
 *     /**
 *      * @file security-view-calendar.internals.ts
 *      * @module frontend/src/features/security/composables
 *      *
 *
 * 合并后这些块留在文件中间，一个 400 行的文件里出现 3 个互相矛盾的 `@file`
 * —— 读的人无法判断「这个文件到底是什么」。文件顶部的头注释是**契约**，
 * 中间的不该出现。
 *
 * 处理口径：
 * - 保留**第一处** `@file` 块（那是文件真正的头注释）；
 * - 其后的 `@file` 块改写成一行分区标记：`/* ── 原 <name> 的实现 ── *​/`
 *   （保留可追溯性，但不再冒充文件头）；
 * - 若该块后面紧跟一行纯描述注释，一并保留在分区标记之后。
 *
 * 用法：
 *   node ops/scripts/codemod/clean-merged-headers.mjs            # 报告
 *   node ops/scripts/codemod/clean-merged-headers.mjs --write
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { walkFiles } from '../../lib/walk.mjs'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const ROOTS = ['homeos/frontend/src', 'homeos/store/frontend/src', 'homeos-store/frontend/src']
const WRITE = process.argv.includes('--write')

let touched = 0
let converted = 0

/** 行扫描：把「与本文件不同名」的 `@file` 块换成分区标记。 */
function clean(text, selfName) {
  const lines = text.split('\n')
  const out = []
  let index = 0
  let localConverted = 0
  let keptSelf = false

  while (index < lines.length) {
    const line = lines[index]
    if (line.trim().startsWith('/*')) {
      let end = index
      if (!line.includes('*/')) {
        end = index + 1
        while (end < lines.length && !lines[end].includes('*/')) end += 1
      }
      const block = lines.slice(index, end + 1)
      const fileLine = block.find((l) => /@file\s+\S/.test(l))
      if (fileLine) {
        const name = fileLine.replace(/^[\s*]*@file\s+/, '').trim()
        // 与本文件同名 = 真正的文件头；其余都是合并残留。
        if (name === selfName && !keptSelf) {
          keptSelf = true
          out.push(...block)
        } else {
          out.push(`/* ── 原 ${name} 的实现 ── */`)
          localConverted += 1
        }
      } else {
        out.push(...block)
      }
      index = end + 1
      continue
    }
    out.push(line)
    index += 1
  }
  return { text: out.join('\n'), converted: localConverted }
}

for (const root of ROOTS) {
  if (!existsSync(resolve(REPO_ROOT, root))) continue
  for (const abs of walkFiles(resolve(REPO_ROOT, root))) {
    const rel = abs.split('\\').join('/')
    if (!/\.(ts|tsx|vue)$/.test(rel)) continue
    const text = readFileSync(abs, 'utf8')
    if (!text.includes('@file')) continue
    const selfName = rel.slice(rel.lastIndexOf('/') + 1)
    const result = clean(text, selfName)
    if (result.text === text) continue
    touched += 1
    converted += result.converted
    if (WRITE) writeFileSync(abs, result.text, 'utf8')
  }
}

console.log(`${WRITE ? '已清理' : '待清理'} ${touched} 个文件，改写 ${converted} 处次级 @file 头`)
