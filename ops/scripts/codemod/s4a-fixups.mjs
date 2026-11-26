#!/usr/bin/env node
/**
 * S4a 之后的消歧 fixup。
 *
 * 合并按「功能族」进行，但族内两个文件各自定义了同名的**模块私有**符号。
 * 这类同名不是「同一职责」，而是历史上抄了两份；合并后必须显式区分，
 * 否则 TS 报 `Cannot redeclare block-scoped variable`。
 *
 * 处理的三个点（都在 studio-app/ui）：
 * 1. `lighting.ts`：`lighting-row.ts` 与 `lighting-row-install.ts` 各写了一次
 *    `const ROW_ID = 'drawing-lighting-row'`，字符串完全一致 → 删掉第二份。
 * 2. `wiring.ts`：`tool-option-wiring.ts` 与 `placed-items-wiring.ts` 各有一份
 *    `wirings` / `typeNamesCache` / `typeNames`（功能等价但独立缓存）→ 后者加 `place` 前缀。
 *
 * 幂等：重复执行不会二次改写。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const UI = 'homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/ui'

/** 删除第二次出现的 `const ROW_ID = 'drawing-lighting-row'`。 */
function dedupeRowId() {
  const path = resolve(REPO_ROOT, `${UI}/lighting.ts`)
  const text = readFileSync(path, 'utf8')
  const needle = "const ROW_ID = 'drawing-lighting-row'"
  const first = text.indexOf(needle)
  if (first < 0) return
  const second = text.indexOf(needle, first + needle.length)
  if (second < 0) return
  const lineStart = text.lastIndexOf('\n', second) + 1
  const lineEnd = text.indexOf('\n', second) + 1
  writeFileSync(path, text.slice(0, lineStart) + text.slice(lineEnd), 'utf8')
  console.log('  fix lighting.ts: 删除重复的 ROW_ID 声明')
}

/** 把 `placed-items-wiring` 那一段的三个私有符号加 `place` 前缀。 */
function namespacePlaceWiring() {
  const path = resolve(REPO_ROOT, `${UI}/wiring.ts`)
  const text = readFileSync(path, 'utf8')
  const marker = 'const wirings = new WeakMap<StudioAppContext, PlaceWiring>()'
  const index = text.indexOf(marker)
  if (index < 0) return
  const head = text.slice(0, index)
  let tail = text.slice(index)
  // 幂等：已改名就跳过。
  if (tail.startsWith('const placeWirings')) return
  tail = tail
    .replace(/\bwirings\b/g, 'placeWirings')
    .replace(/\btypeNamesCache\b/g, 'placeTypeNamesCache')
    .replace(/\btypeNames\b/g, 'placeTypeNames')
  writeFileSync(path, head + tail, 'utf8')
  console.log('  fix wiring.ts: placed-items 私有符号加 place 前缀')
}

dedupeRowId()
namespacePlaceWiring()
