#!/usr/bin/env node
/**
 * 工具链版本一致性守卫：Bun / Python / 基础镜像摘要这三条「写了两遍以上」的版本线。
 *
 * ## 为什么需要
 *
 * 这三类版本都**不影响编译**，所以漂移不会报错，只会以两种昂贵的方式暴露：
 *
 * 1. **本地绿、CI 红**：根 `package.json` 的 `packageManager` 与 workflow 的
 *    `bun-version` 各钉一个版本时，`bun install` 对 lockfile 的严格度由安装器决定，
 *    一侧升级另一侧不动，问题会以「锁文件字段重排」这种噪声形态出现。
 * 2. **发版才炸**：`ops/docker-pins.json` 的注释写明「三处镜像面应与这里逐字一致」，
 *    `ops/build.py` 的 docstring 也写着「该门禁会连同镜像站改写逻辑一起做行为测试」——
 *    但那条门禁此前**并不存在**。于是「只改 tag 忘改摘要」这类改动要等到手动
 *    dispatch 的发版流水线才暴露（历史上有过 amd64/arm64 双双失败的一轮）。
 *
 * ## 判定口径
 *
 * **A. Bun**（硬一致）
 *   根 `package.json` 的 `packageManager: bun@x.y.z` 是唯一真源；workflow 的
 *   `bun-version` 必须逐字相等；`bun-version-file` 判失败（等于再开一处真源）；
 *   `homeos-store` 的 `engines.bun` 若有，下界必须相同。
 *
 * **B. 基础镜像**（硬一致）
 *   `ops/docker-pins.json` 是唯一真源；`Dockerfile` 的 `ARG <X>_IMAGE=<tag>@<digest>`
 *   与 compose 里出现同一 tag 的 `image:`（含注释态的可选段落）都必须逐字一致。
 *   tag 与 digest 分开比对 —— 只说「不一致」而不指出是 tag 还是摘要，等于让人重头查。
 *
 * **C. Python 运行时**（硬一致）
 *   `Dockerfile` 的 `PYTHON_IMAGE` 决定真实解释器版本；workflow 的 `python-version`
 *   必须与之同 minor。CI 上跑 3.14、镜像里是 3.15 时，`check:python-lock` 的
 *   wheel 可用性判断会与真实安装环境脱节。
 *
 * **D. Python 工具声明**（允许落后一个 minor，绝不允许超前）
 *   `ruff.toml` 的 `target-version` 与 `pyproject.toml` 的 `requires-python` 是**声明**，
 *   不必等于运行时：上游工具链（ruff / pip / setuptools）常常还没支持最新 minor，
 *   强行要求相等会把「升级 Python」这件事卡在工具链上。因此只要求
 *   `runtime - 1 <= declared <= runtime`：
 *   - 超前（声明 3.16 而运行时 3.15）= 谎报，会放行跑不了的语法 → 失败；
 *   - 落后超过一个 minor（声明 3.11 而运行时 3.15）= 事实上的静默失效
 *     （`requires-python` 拦不住任何东西，ruff 也不按真实语法集检查）→ 失败。
 *
 * ## 用法
 *
 * ```bash
 * node ops/checks/check_toolchain.mjs          # 校验（门禁）
 * node ops/checks/check_toolchain.mjs --json   # 机器可读
 * ```
 *
 * 不提供 `--fix`：改版本是升级动作，必须显式改真源、再跑一遍门禁确认三处都跟上。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../..')
const asJson = process.argv.includes('--json')
const problems = []
const notes = []

/** 相对路径 → 文本（缺文件时抛带路径的错，别让人猜是哪一份）。 */
function readText(relative) {
  try {
    return readFileSync(join(repoRoot, relative), 'utf8')
  } catch (error) {
    throw new Error(`读不到 ${relative}：${error.message}`)
  }
}

function readJson(relative) {
  try {
    return JSON.parse(readText(relative))
  } catch (error) {
    throw new Error(`${relative} 解析失败：${error.message}`)
  }
}

/** `1.2.3` / `>=1.2.3` / `~1.2` → `[1, 2, 3]`（取第一个三元组）；取不到返回 null。 */
function semverTriple(value) {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(String(value || '').trim())
  return match ? match.slice(1, 4).map(Number) : null
}

function fail(message) {
  problems.push(message)
}

// ── A. Bun ────────────────────────────────────────────────────────────────
const rootPkg = readJson('package.json')
const bunMatch = /^bun@(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/.exec(String(rootPkg.packageManager || '').trim())
const bunVersion = bunMatch ? bunMatch[1] : null
if (!bunVersion) {
  fail('根 package.json 的 packageManager 必须写成 "bun@<x.y.z>"')
}

/** 扫描 workflow 目录里的 bun-version / bun-version-file。 */
function workflowPins() {
  const dir = join(repoRoot, '.github/workflows')
  let files = []
  try {
    files = readdirSync(dir).filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  } catch {
    return []
  }
  const pins = []
  for (const name of files.sort()) {
    readText(`.github/workflows/${name}`)
      .split('\n')
      .forEach((line, index) => {
        const match = /^\s*(bun-version|python-version)(-file)?:\s*(.+?)\s*$/.exec(line)
        if (!match) return
        pins.push({
          file: `.github/workflows/${name}`,
          line: index + 1,
          key: `${match[1]}${match[2] || ''}`,
          value: match[3].replace(/^['"]|['"]$/g, ''),
        })
      })
  }
  return pins
}

const pins = workflowPins()
const bunPins = pins.filter((pin) => pin.key.startsWith('bun-version'))
for (const pin of bunPins) {
  if (pin.key === 'bun-version-file') {
    fail(
      `${pin.file}:${pin.line} 用了 bun-version-file（等于又开一处真源）；请改回 bun-version: ${bunVersion ?? '<packageManager 版本>'}`,
    )
    continue
  }
  if (bunVersion && pin.value !== bunVersion) {
    fail(`${pin.file}:${pin.line} bun-version=${pin.value}，packageManager 是 bun@${bunVersion}`)
  }
}

const storePkg = readJson('homeos-store/package.json')
const storeEngine = storePkg.engines?.bun
if (typeof storeEngine === 'string' && bunVersion) {
  const lower = semverTriple(storeEngine)
  const expected = semverTriple(bunVersion)
  if (!lower || !expected || lower.join('.') !== expected.join('.')) {
    fail(`homeos-store/package.json 的 engines.bun="${storeEngine}" 下界应为 ${bunVersion}`)
  }
}

// ── B. 基础镜像摘要 ────────────────────────────────────────────────────────
const pinsFile = readJson('ops/docker-pins.json')
const images = pinsFile.images || {}
const dockerfile = readText('Dockerfile')

/** Dockerfile 里的 `ARG <KEY>_IMAGE=...` 默认值。 */
function dockerfileArgs() {
  const args = {}
  for (const line of dockerfile.split('\n')) {
    const match = /^\s*ARG\s+([A-Z0-9_]+)_IMAGE=(.+?)\s*$/.exec(line)
    if (match) args[match[1].toLowerCase()] = match[2].trim()
  }
  return args
}

const argImages = dockerfileArgs()
/** compose（含注释掉的可选段）里出现的 `image: <tag>@<digest>`，按 tag 建索引。 */
function composeImages() {
  const found = []
  for (const name of ['docker-compose.yml', 'docker-compose.app.yml']) {
    let text = ''
    try {
      text = readText(name)
    } catch {
      continue
    }
    text.split('\n').forEach((line, index) => {
      const match = /image:\s*([^\s#]+)/.exec(line)
      if (!match) return
      const ref = match[1]
      if (!/^[a-z0-9.-]+\/[a-z0-9.-]+|^[a-z0-9.-]+:/i.test(ref)) return
      found.push({ file: name, line: index + 1, ref })
    })
  }
  return found
}

const composeRefs = composeImages()
for (const [key, pin] of Object.entries(images)) {
  const tag = String(pin.upstream_tag || '').trim()
  const digest = String(pin.digest || '').trim()
  const expected = digest ? `${tag}@${digest}` : tag
  const actual = argImages[key]
  if (actual === undefined) {
    fail(`Dockerfile 缺少 ARG ${key.toUpperCase()}_IMAGE（ops/docker-pins.json 里登记了 ${tag}）`)
  } else if (actual !== expected) {
    const actualTag = actual.split('@')[0]
    const actualDigest = actual.includes('@') ? actual.split('@')[1] : ''
    if (actualTag !== tag) {
      fail(`Dockerfile ARG ${key.toUpperCase()}_IMAGE 的 tag 是 ${actualTag}，docker-pins 是 ${tag}`)
    } else if (actualDigest !== digest) {
      fail(
        `Dockerfile ARG ${key.toUpperCase()}_IMAGE 的摘要与 docker-pins 不一致（tag 相同，${actualDigest.slice(0, 19)}… vs ${digest.slice(0, 19)}…）`,
      )
    } else {
      fail(`Dockerfile ARG ${key.toUpperCase()}_IMAGE 与 docker-pins 不一致：${actual} vs ${expected}`)
    }
  }
  // compose 里凡出现同一个 tag 的引用都必须带同一份摘要（注释态的可选段同样算）。
  for (const ref of composeRefs) {
    const refTag = ref.ref.split('@')[0]
    if (refTag !== tag) continue
    if (digest && ref.ref !== expected) {
      fail(`${ref.file}:${ref.line} 的 ${refTag} 与 docker-pins 不一致（缺摘要或摘要不同）`)
    }
  }
}

// ── C. Python 运行时 ──────────────────────────────────────────────────────
const pythonPin = String(images.python?.upstream_tag || '')
const pythonFromTag = /python:(\d+)\.(\d+)/.exec(pythonPin)
const runtimeMinor = pythonFromTag ? Number(pythonFromTag[2]) : null
if (!pythonFromTag) {
  fail(`ops/docker-pins.json 的 images.python.upstream_tag 应形如 python:3.15-slim-bookworm，实际是 "${pythonPin}"`)
}

for (const pin of pins.filter((item) => item.key === 'python-version')) {
  const parsed = /^(\d+)\.(\d+)/.exec(pin.value)
  if (!parsed) {
    fail(`${pin.file}:${pin.line} python-version="${pin.value}" 不是 x.y 形式`)
    continue
  }
  if (runtimeMinor !== null && Number(parsed[2]) !== runtimeMinor) {
    fail(`${pin.file}:${pin.line} python-version=${pin.value}，镜像里的解释器是 ${pythonPin}（应为 3.${runtimeMinor}）`)
  }
}

// ── D. Python 工具声明（允许落后一个 minor，不允许超前）────────────────────
if (runtimeMinor !== null) {
  const ruffToml = readText('ruff.toml')
  const ruffTarget = /target-version\s*=\s*"py(\d)(\d+)"/.exec(ruffToml)
  if (!ruffTarget) {
    fail('ruff.toml 缺少 target-version = "pyXY"')
  } else {
    const target = Number(ruffTarget[1]) * 10 + Number(ruffTarget[2])
    const runtime = 3 * 10 + runtimeMinor
    if (target > runtime) {
      fail(
        `ruff.toml target-version=py${ruffTarget[1]}${ruffTarget[2]} 高于运行时 3.${runtimeMinor}（会放行跑不了的语法）`,
      )
    } else if (target < runtime - 1) {
      fail(
        `ruff.toml target-version=py${ruffTarget[1]}${ruffTarget[2]} 落后运行时 3.${runtimeMinor} 超过一个 minor（按旧语法集检查等于静默失效）`,
      )
    }
  }

  const backendPyproject = readText('homeos/backend/pyproject.toml')
  const requires = /requires-python\s*=\s*"([^"]+)"/.exec(backendPyproject)
  if (!requires) {
    fail('homeos/backend/pyproject.toml 缺少 requires-python')
  } else {
    const floor = /(\d+)\.(\d+)/.exec(requires[1])
    if (!floor) {
      fail(`requires-python="${requires[1]}" 解析不出下界`)
    } else {
      const minor = Number(floor[2])
      if (minor > runtimeMinor) {
        fail(`requires-python="${requires[1]}" 高于运行时 3.${runtimeMinor}`)
      } else if (minor < runtimeMinor - 1) {
        fail(`requires-python="${requires[1]}" 落后运行时 3.${runtimeMinor} 超过一个 minor（这条声明拦不住任何东西）`)
      }
    }
  }
  notes.push(`运行时 Python 3.${runtimeMinor}；工具声明允许落后到 3.${runtimeMinor - 1}`)
}

// ── 输出 ──────────────────────────────────────────────────────────────────
const summary = {
  bun: bunVersion,
  pythonRuntime: pythonFromTag ? `3.${runtimeMinor}` : null,
  bunPins: bunPins.length,
  pythonPins: pins.filter((pin) => pin.key === 'python-version').length,
  images: Object.keys(images),
  notes,
  problems,
  ok: problems.length === 0,
}

if (asJson) {
  console.log(JSON.stringify(summary, null, 2))
} else if (problems.length > 0) {
  console.error(`工具链版本不一致（${problems.length} 处）：`)
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('')
  console.error('  真源：Bun → 根 package.json 的 packageManager；Python / 基础镜像 → ops/docker-pins.json。')
  console.error('  workflow 与 Dockerfile / compose 只能跟随；升级是显式动作，不是顺手改一处。')
} else {
  console.log(
    `工具链一致：bun@${bunVersion}（workflow ${summary.bunPins} 处）、` +
      `Python ${summary.pythonRuntime}（workflow ${summary.pythonPins} 处）、` +
      `基础镜像 ${summary.images.join(' / ')} 摘要与 Dockerfile / compose 对齐。`,
  )
  for (const note of notes) console.log(`  ${note}`)
}
process.exit(problems.length > 0 ? 1 : 0)
