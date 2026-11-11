/**
 * runtime 公共契约冻结（G6）。
 *
 * `vite.runtime.config.ts` 把 `src/studio/runtime/**` 的每个 .ts 都发布成
 * `/api/v1/modules/interaction3d/<path>.js`，宿主页、导出包与自定义模块都可能按 URL 直接 import；
 * 舞台 iframe 与宿主之间靠 `hb-i3d-v1` 通道的消息类型通信。这两类都不是「仓库内无引用就能删」的代码。
 *
 * 本测试只拦「删除」：快照里有、源码里没有的模块 / 运行时导出 / 消息类型会失败；新增不拦。
 * 确认要删时：HOMEOS_UPDATE_CONTRACT=1 bun test ops/checks/studio/tests/runtime-contract.test.mjs，
 * 并在提交说明里写明删除理由。
 */
import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const runtimeRoot = join(repoRoot, 'homeos/frontend/src/studio/runtime')
const snapshotPath = fileURLToPath(new URL('../runtime-contract.json', import.meta.url))
const MESSAGE_SOURCES = [
  'homeos/frontend/src/studio/runtime/core/runtime.ts',
  'homeos/frontend/src/studio/runtime/core/stage.ts',
  'homeos/frontend/src/studio/runtime/core/stage',
]

function walk(dir, predicate) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, predicate))
    else if (predicate(entry.name)) out.push(full)
  }
  return out
}

/** 运行时导出名（类型导出在编译后不存在，不算契约）。 */
function runtimeExports(source) {
  const names = new Set()
  for (const match of source.matchAll(
    /^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm,
  ))
    names.add(match[1])
  for (const match of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of match[1].split(',')) {
      const item = part.trim()
      if (!item || item.startsWith('type ')) continue
      names.add(
        item
          .split(/\s+as\s+/)
          .pop()
          .trim(),
      )
    }
  }
  if (/^export\s+default\b/m.test(source)) names.add('default')
  return [...names].sort()
}

function collectContract() {
  const modules = {}
  for (const file of walk(runtimeRoot, (name) => name.endsWith('.ts') && !name.endsWith('.d.ts')).sort()) {
    modules[relative(runtimeRoot, file).replace(/\\/g, '/')] = runtimeExports(readFileSync(file, 'utf8'))
  }
  const messageTypes = new Set()
  for (const source of MESSAGE_SOURCES) {
    const full = join(repoRoot, source)
    const files = source.endsWith('.ts') ? [full] : walk(full, (name) => name.endsWith('.ts'))
    for (const file of files) {
      for (const match of readFileSync(file, 'utf8').matchAll(/\btype:\s*['"]([a-z][a-z0-9:-]*)['"]/g))
        messageTypes.add(match[1])
    }
  }
  return { modules, messageTypes: [...messageTypes].sort() }
}

test('runtime 公共契约：模块、运行时导出与消息类型只增不删', () => {
  const current = collectContract()
  if (process.env.HOMEOS_UPDATE_CONTRACT === '1') {
    writeFileSync(snapshotPath, `${JSON.stringify(current, null, 2)}\n`)
    return
  }
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'))
  const missing = []
  for (const [module, exports] of Object.entries(snapshot.modules)) {
    if (!(module in current.modules)) {
      missing.push(`模块 ${module}`)
      continue
    }
    for (const name of exports) if (!current.modules[module].includes(name)) missing.push(`导出 ${module}#${name}`)
  }
  for (const type of snapshot.messageTypes) if (!current.messageTypes.includes(type)) missing.push(`消息类型 ${type}`)
  assert.deepEqual(
    missing,
    [],
    `runtime 契约被删除（确认后用 HOMEOS_UPDATE_CONTRACT=1 更新快照）：\n${missing.join('\n')}`,
  )
})
