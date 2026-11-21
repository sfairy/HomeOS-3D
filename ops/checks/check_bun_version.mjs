#!/usr/bin/env node
/**
 * 工具链版本一致性守卫：CI 的 `bun-version` 必须等于根 `package.json` 的 `packageManager`。
 *
 * ## 为什么需要
 *
 * Bun 版本此前写了两处：根 `package.json` 的 `packageManager: bun@1.4.5`（本地 bunx /
 * `bun install` 用它校验锁文件），以及 `.github/workflows/*.yml` 里 5 个
 * `oven-sh/setup-bun` 步骤的 `bun-version: 1.4.4`。两处漂移的后果不是「报错」，而是
 * **本地绿、CI 红**（或反过来）：锁文件格式与 `--frozen-lockfile` 的严格度由安装器版本
 * 决定，一侧升级后另一侧仍用旧解析器，问题会以「换行 / 字段重排」这种噪声形态出现，
 * 排查成本远高于维护成本。
 *
 * 单点真源是根 `package.json` 的 `packageManager`；workflow 只能跟随，不允许各自钉版本。
 * 本脚本不做自动修改（`--fix` 也不提供）：改版本是升级动作，必须显式改两处并跑一遍门禁。
 *
 * ## 判定口径
 *
 * 1. 根 `package.json` 必须有 `packageManager: "bun@<semver>"`；
 * 2. `.github/workflows/*.yml`（含 `*.yaml`）里每个 `bun-version:` 必须与之逐字相等；
 * 3. 出现 `bun-version-file:` 时判失败 —— setup-bun 会从文件读版本，等于又开了一处真源；
 * 4. `homeos-store/package.json` 若有 `engines.bun`，其下界必须等于该版本
 *    （`>=1.4.5` 这种写法只允许下界相同，不允许 `>=1.4.4` 悄悄放宽）。
 *
 * ## 用法
 *
 * ```bash
 * node ops/checks/check_bun_version.mjs          # 校验（门禁用）
 * node ops/checks/check_bun_version.mjs --json   # 机器可读
 * ```
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../..')
const asJson = process.argv.includes('--json')
const WORKFLOW_DIR = join(repoRoot, '.github/workflows')

/** 读取 JSON（带路径提示：缺文件 / 语法错都要说清是哪一份）。 */
function readJson(relative) {
  const absolute = join(repoRoot, relative)
  try {
    return JSON.parse(readFileSync(absolute, 'utf8'))
  } catch (error) {
    throw new Error(`读不到 ${relative}：${error.message}`)
  }
}

/** 从 `packageManager` 里取 bun 版本号。 */
function bunVersionFromPackageManager(value) {
  const match = /^bun@(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/.exec(String(value || '').trim())
  return match ? match[1] : null
}

/** 扫描 workflow 目录，返回 `[{file, line, version}]`。 */
function collectWorkflowPins() {
  let files = []
  try {
    files = readdirSync(WORKFLOW_DIR).filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  } catch {
    return []
  }
  const pins = []
  for (const name of files.sort()) {
    const lines = readFileSync(join(WORKFLOW_DIR, name), 'utf8').split('\n')
    lines.forEach((line, index) => {
      const match = /^\s*bun-version(?:-file)?:\s*(.+?)\s*$/.exec(line)
      if (!match) return
      pins.push({
        file: `.github/workflows/${name}`,
        line: index + 1,
        key: line.includes('bun-version-file') ? 'bun-version-file' : 'bun-version',
        version: match[1].replace(/^['"]|['"]$/g, ''),
      })
    })
  }
  return pins
}

function main() {
  const problems = []
  const root = readJson('package.json')
  const expected = bunVersionFromPackageManager(root.packageManager)
  if (!expected) {
    problems.push('根 package.json 的 packageManager 必须写成 "bun@<x.y.z>"')
  }

  const pins = collectWorkflowPins()
  for (const pin of pins) {
    if (pin.key === 'bun-version-file') {
      problems.push(
        `${pin.file}:${pin.line} 用了 bun-version-file（等于又开一处真源）；请改回 bun-version: ${expected ?? '<packageManager 版本>'}`,
      )
      continue
    }
    if (expected && pin.version !== expected) {
      problems.push(`${pin.file}:${pin.line} bun-version=${pin.version}，packageManager 是 bun@${expected}`)
    }
  }

  const store = readJson('homeos-store/package.json')
  const engine = store.engines?.bun
  if (typeof engine === 'string' && expected) {
    const lower = /(\d+\.\d+\.\d+)/.exec(engine)
    if (!lower || lower[1] !== expected) {
      problems.push(`homeos-store/package.json 的 engines.bun="${engine}" 下界应为 ${expected}`)
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ expected, pins, problems, ok: problems.length === 0 }, null, 2))
  } else if (problems.length > 0) {
    console.error(`工具链版本不一致（${problems.length} 处）：`)
    for (const problem of problems) console.error(`  - ${problem}`)
    console.error('  真源是根 package.json 的 packageManager；升级 Bun 时改那一处 + workflow 跟随。')
  } else {
    console.log(`Bun 版本一致：packageManager bun@${expected}，workflow ${pins.length} 处引用全部跟随。`)
  }
  process.exit(problems.length > 0 ? 1 : 0)
}

main()
