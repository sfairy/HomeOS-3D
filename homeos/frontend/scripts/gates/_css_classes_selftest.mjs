#!/usr/bin/env node
/**
 * `check-css-classes.mjs` 的负向自检：把副本改坏 / 改对，逐条确认判定口径。
 *
 * 覆盖：
 *  * 整块 wr- 死规则（普通 / `:is()` 前缀 / `@keyframes wr-*`）→ 必须拦；
 *  * 活选择器（`:not(.wr-x)` 恒真、混合列表里另有活分支）→ 必须放行（零误报）；
 *  * `wr-` 命名空间被代码复活 → 放行（启发式失效，避免误判）；
 *  * 扫不到 .css / 解析不到规则块 → 判门禁自身失效（退出码 2）。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { check, report } from '../_smoke_harness.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CHECKER = path.join(HERE, 'check-css-classes.mjs')

// 本文件沿用 (cond, label) 的调用序；口径（[PASS]/[FAIL] + 计数 + 收尾）走共用 harness。
const assert = (cond, label) => check(label, cond)

function makeRoot(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'css-classes-'))
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }
  return root
}

function run(root) {
  return spawnSync(process.execPath, [CHECKER, '--root', root, '--quiet'], { encoding: 'utf8' })
}

function remove(root) {
  fs.rmSync(root, { recursive: true, force: true })
}

// S1 干净树：活选择器 + `:not(.wr-*)` + 混合列表（含活分支）→ 全放行
{
  const root = makeRoot({
    'src/clean.css': [
      '.card { color: red; }',
      'input[type="range"]:not(.wr-range) { width: 100%; }',
      '.live-a,\n.live-b.wr-inline { padding: 4px; }',
      '@media (min-width: 600px) { .card { color: blue; } }',
    ].join('\n'),
  })
  const r = run(root)
  assert(r.status === 0, `S1 干净树放行（exit ${r.status}）`)
  remove(root)
}

// S2 整块 wr- 死规则（普通）→ 拦
{
  const root = makeRoot({ 'src/dead.css': '.wr-btn-x { color: red; }\n.keep { color: blue; }\n' })
  const r = run(root)
  assert(r.status === 1, `S2 纯 wr- 块报红（exit ${r.status}）`)
  assert(/wr-btn-x/.test(r.stderr), 'S2 点名死选择器 .wr-btn-x')
  remove(root)
}

// S3 `:is()` 前缀 + wr- 目标 → 拦
{
  const root = makeRoot({
    'src/dead.css': ':is(.workspace, .builder) .wr-shell--embedded .wr-bar { color: red; }\n',
  })
  const r = run(root)
  assert(r.status === 1, `S3 :is() 前缀死块报红（exit ${r.status}）`)
  remove(root)
}

// S4 混合列表：一条死分支 + 一条活分支 → 放行（零误报的关键）
{
  const root = makeRoot({
    'src/mixed.css': '.live,\n.live.wr-inline,\n.other.wr-x { color: red; }\n',
  })
  const r = run(root)
  assert(r.status === 0, `S4 混合列表放行（exit ${r.status}）`)
  remove(root)
}

// S5 `:not(.wr-x)` 恒真守卫 → 放行
{
  const root = makeRoot({
    'src/not.css': 'input:not(.wr-range):not(.wr-slider) { width: 100%; }\n',
  })
  const r = run(root)
  assert(r.status === 0, `S5 :not() 守卫放行（exit ${r.status}）`)
  remove(root)
}

// S6 `@keyframes wr-*` → 拦
{
  const root = makeRoot({
    'src/kf.css': '@keyframes wr-spin { from { transform: rotate(0); } to { transform: rotate(1turn); } }\n.keep { color: red; }\n',
  })
  const r = run(root)
  assert(r.status === 1, `S6 wr- keyframes 报红（exit ${r.status}）`)
  assert(/wr-spin/.test(r.stderr), 'S6 点名 @keyframes wr-spin')
  remove(root)
}

// S7 代码复活 `wr-` 命名空间 → 放行（启发式失效，不误判）
{
  const root = makeRoot({
    'src/dead.css': '.wr-btn-x { color: red; }\n',
    'src/use.ts': "export const cls = 'wr-btn-x'\n",
  })
  const r = run(root)
  assert(r.status === 0, `S7 命名空间复活时放行（exit ${r.status}）`)
  remove(root)
}

// S8 扫不到任何 .css → 门禁自身失效（exit 2）
{
  const root = makeRoot({ 'src/empty.txt': 'hello\n' })
  const r = run(root)
  assert(r.status === 2, `S8 无 .css 判自身失效（exit ${r.status}）`)
  remove(root)
}

// S9 有 .css 但解析不到规则块 → 门禁自身失效（exit 2）
{
  const root = makeRoot({ 'src/only-comments.css': '/* nothing here */\n' })
  const r = run(root)
  assert(r.status === 2, `S9 无规则块判自身失效（exit ${r.status}）`)
  remove(root)
}

report('死 CSS 门禁自检')
