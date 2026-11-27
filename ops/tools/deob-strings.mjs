#!/usr/bin/env bun
/**
 * 0.9.0 差异清单的可复跑取证工具：混淆 JS 字符串集解码 + 两版比对。
 *
 * ## 为什么需要它
 *
 * 发布包前端是 `javascript-obfuscator` 产物（字符串数组 + 十六进制下标 + 数组轮转），
 * `diff` 只能看出「文件变了」，看不出「行为变了」。按文件体积排序会漏掉「体积小但语义重」
 * 的文件（0.9.0 第一轮就漏了 40 个，见 docs/upgrade-0.9.0/DIFF-AND-PORT-PLAN.md §8）。
 * 本工具把每个文件里的字符串**解出来**再求差集，差异就是可观察行为面。
 *
 * ## 解码原理（三件套）
 *
 * 1. 字符串数组：`function _0xa(){const _0xb=['...'];...return _0xa();}`
 * 2. 解码器：`function _0xc(i,j){const s=_0xa();return _0xc=function(k,l){k=k-0x99;...},_0xc(i,j);}`
 * 3. 轮转 IIFE：`(function(arr,n){while(1){try{...arr.push(arr.shift())}catch{...}}}(_0xa,0xNNN));`
 *
 * 把 1+3 在 vm 里跑一遍，数组就被轮转到正确相位；再调解码器就能把 `_0xc(0x1a2)` 换成明文。
 * 单文件里常有多组别名（`_0xd=_0xc`），故按「赋值右值」递归解析到真正的解码器。
 *
 * ## 后端 `.das`
 *
 * PyArmor 反汇编只有常量区可读，且 90% 差异是 `__pyarmor_enter_NNNN__` 序号变化。
 * `--backend` 会把这些序号与字节码助记符剔除，只留标识符和字符串常量。
 *
 * ## 用法
 *
 * ```bash
 * # 1) 前端：打印有语义差异的文件与其新增/移除串
 * node ops/tools/deob-strings.mjs --root 源代码 --from 0.8.9 --to 0.9.0
 *
 * # 2) 只看某个文件
 * node ops/tools/deob-strings.mjs --root 源代码 --from 0.8.9 --to 0.9.0 \
 *   --file frontend/modules/interaction3d/car-state.js
 *
 * # 3) 机读（JSON）
 * node ops/tools/deob-strings.mjs --root 源代码 --from 0.8.9 --to 0.9.0 --json
 *
 * # 4) 后端 `.das` 语义差异
 * node ops/tools/deob-strings.mjs --backend --root 源代码 --from 0.8.9 --to 0.9.0
 * ```
 *
 * 退出码：有差异返回 0（这是取证工具，不是门禁）；参数或路径错误返回 2。
 */
import fs from 'node:fs'
import path from 'node:path'

import { decodeBackendFile, decodeObfuscatedFile, interestingString } from '../lib/deob-decode.mjs'

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const valueOf = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
}

const ROOT = path.resolve(valueOf('root', '.'))
const FROM = valueOf('from', '0.8.9')
const TO = valueOf('to', '0.9.0')
const FILE = valueOf('file', '')
const JSON_OUT = flag('json')
const BACKEND = flag('backend')
const VERBOSE = flag('verbose')

if (!fs.existsSync(path.join(ROOT, FROM)) || !fs.existsSync(path.join(ROOT, TO))) {
  console.error(`找不到版本目录：${path.join(ROOT, FROM)} 或 ${path.join(ROOT, TO)}`)
  process.exit(2)
}

/** 递归列出目录下的文件（相对 root/version 的路径）。 */
function listFiles(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) listFiles(full, base, out)
    else out.push(path.relative(base, full))
  }
  return out
}

const suffix = BACKEND ? '.das' : '.js'
const decode = BACKEND ? decodeBackendFile : decodeObfuscatedFile
const prefix = BACKEND ? 'backend/' : 'frontend/'

let files
if (FILE) {
  files = [FILE]
} else {
  const toFiles = new Set(listFiles(path.join(ROOT, TO, prefix)))
  const fromFiles = new Set(listFiles(path.join(ROOT, FROM, prefix)))
  files = [...toFiles].filter((file) => file.endsWith(suffix) && fromFiles.has(file)).sort()
}

const report = []
for (const file of files) {
  const fromPath = path.join(ROOT, FROM, prefix, file)
  const toPath = path.join(ROOT, TO, prefix, file)
  if (!fs.existsSync(fromPath) || !fs.existsSync(toPath)) continue

  const before = decode(fromPath)
  const after = decode(toPath)
  // 后端：带引号的字面量一律保留，标识符再按命名风格过滤。
  const keep = (text, source) =>
    interestingString(text, { backend: BACKEND, quoted: source.quoted?.has(text) === true })
  const added = [...after.strings].filter((text) => !before.strings.has(text) && keep(text, after)).sort()
  const removed = [...before.strings].filter((text) => !after.strings.has(text) && keep(text, before)).sort()
  if (!added.length && !removed.length) continue

  report.push({
    file: `${prefix}${file}`,
    added,
    removed,
    stats: {
      before: before.strings.size,
      after: after.strings.size,
      decodedBefore: before.decoded,
      decodedAfter: after.decoded,
    },
  })

  if (!JSON_OUT) {
    console.log(`\n=== ${prefix}${file}  (+${added.length} / -${removed.length})`)
    if (VERBOSE)
      console.log(
        `    串数 ${before.strings.size} → ${after.strings.size}，解码命中 ${before.decoded}/${before.total} → ${after.decoded}/${after.total}`,
      )
    if (added.length) console.log(`  + ${added.join(' ‖ ')}`)
    if (removed.length) console.log(`  - ${removed.join(' ‖ ')}`)
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ root: ROOT, from: FROM, to: TO, backend: BACKEND, files: report }, null, 2))
} else {
  console.log(
    `\n共 ${report.length} 个文件有语义差异（${BACKEND ? 'backend .das' : 'frontend .js'}，扫描 ${files.length} 个）。`,
  )
}
