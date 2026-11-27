#!/usr/bin/env node
/**
 * 拆开「目录合并产出的泛化名巨石」。
 *
 * 背景：`plan-collapse.mjs` 把碎片目录并成同名单文件，产出了 `ui.ts`(1559 行)、
 * `store.ts`(2113 行)、`composables.ts`(1676 行) 这类**以目录名命名的杂物抽屉**。
 * 文件数降了，但「一个文件混了十几件不相关的事」比碎片更难维护 —— 这是设计倒退。
 *
 * 本脚本按相反方向修复：
 * 1. 从 `--from <commit>` 恢复原来的目录文件（保持原文件名与职责）；
 * 2. 生成 `index.ts` 桶文件，导出目录内全部模块 —— 这样**所有既有 import 说明符
 *    （`@/path/to/dir`）继续有效**，调用方零改动；
 * 3. 删掉那个巨石文件。
 *
 * 为什么这种回退是安全的：说明符解析顺序是 `x.ts` → `x/index.ts`。删掉 `x.ts`
 * 并补上 `x/index.ts` 后，同一个说明符仍解析成功，且导出集合是原来的超集。
 *
 * 用法：
 *   node ops/scripts/codemod/split-junk-drawers.mjs --from 1dbd81482 \
 *     kernel/utils/ui domain/layout/store features/voice/composables
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const SRC = 'homeos/frontend/src'

const args = process.argv.slice(2)
const fromIndex = args.indexOf('--from')
const fromCommit = fromIndex > -1 ? args[fromIndex + 1] : null
const targets = args.filter((a) => !a.startsWith('--') && a !== fromCommit)
const WRITE = args.includes('--write')

if (!fromCommit || !targets.length) {
  console.error('用法: split-junk-drawers.mjs --from <commit> [--write] <dir>...')
  process.exit(2)
}

const git = (cmd) => execFileSync('git', cmd, { cwd: REPO_ROOT, encoding: 'utf8' })

for (const target of targets) {
  const relDir = target.replace(/^\.\//, '')
  const dirAbs = resolve(REPO_ROOT, SRC, relDir)
  const monolith = `${dirAbs}.ts`
  if (!existsSync(monolith)) {
    console.log(`  跳过 ${relDir}：${relDir}.ts 不存在`)
    continue
  }
  // 该目录在 fromCommit 里的文件清单
  const listed = git(['ls-tree', '-r', '--name-only', fromCommit, `${SRC}/${relDir}/`])
    .trim()
    .split('\n')
    .filter((line) => line.endsWith('.ts'))
  if (!listed.length) {
    console.log(`  跳过 ${relDir}：${fromCommit} 里没有该目录`)
    continue
  }

  const monolithLines = readFileSync(monolith, 'utf8').split('\n').length
  console.log(`  ${relDir}: ${monolithLines} 行 → ${listed.length} 个文件`)
  if (!WRITE) continue

  mkdirSync(dirAbs, { recursive: true })
  for (const file of listed) {
    const content = git(['show', `${fromCommit}:${file}`])
    writeFileSync(resolve(REPO_ROOT, file), content, 'utf8')
  }

  // 桶文件：导出目录内全部模块（不导出 index 自身）。
  const modules = listed.map((file) => basename(file).replace(/\.ts$/, '')).filter((name) => name !== 'index')
  const barrel = [
    `/**`,
    ` * \`${relDir}\` 公开面。`,
    ` *`,
    ` * 这些模块此前被合并成 \`${basename(relDir)}.ts\`（${monolithLines} 行），`,
    ` * 但它们各自职责不同（见各文件头注释），混在一个文件里无法按职责定位。`,
    ` * 拆回独立文件后由本桶维持既有 import 说明符不变。`,
    ` */`,
    ...modules.map((name) => `export * from './${name}'`),
    '',
  ].join('\n')
  writeFileSync(join(dirAbs, 'index.ts'), barrel, 'utf8')

  rmSync(monolith, { force: true })
}

console.log(WRITE ? '\n已应用。' : '\nDRY RUN：加 --write 落盘。')
