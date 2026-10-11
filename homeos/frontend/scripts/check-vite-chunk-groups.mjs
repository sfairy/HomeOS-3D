#!/usr/bin/env node
/**
 * 构建契约门禁：`vite.config.ts` 里 `codeSplitting.groups` 的每条 test 必须落到真实模块。
 *
 * 为什么需要它：域名重构把文件搬走后，`groups` 里的正则**不会**报错，构建照常成功，那条分组
 * 只是静默失效 —— 零反馈是这类配置错误唯一的症状。本仓库已经历过同一类漂移五次以上：
 * `utils/weather/webgl-weather-renderer`（P2 手删）、`views/(Login|Setup|Guest)View.vue`、
 * `views/Mobile*View.vue`、`components/dashboard/.*Builder`、
 * `components/widgets/{energy,orchestrator,device,care}`、`views/dashboard-chrome.ts`。
 *
 * 判据（对每条带 test 且不指向 node_modules 的组）：
 *   1. test 至少匹配到一个真实源模块，否则该组是**死组**（整条分组失效）；
 *   2. test 里每个顶层 alternation（`(a|b)`）的**每条分支**都至少匹配到一个文件，否则是
 *      **死分支** —— 死分支不会让组消失，只会让它悄悄少覆盖一块，比死组更难发现。
 *
 * 匹配方式与 rolldown 一致：拿模块 id（绝对 posix 路径）逐个喂给 test。CSS 不参与分块
 * （只会是 asset 产物），故文件宇宙只收 `.ts/.tsx/.vue/.js/.mjs/.cjs`。
 *
 * 解析策略：不 import 配置（那是 TS + 一堆插件），只做括号/注释/字符串感知的文本切片，
 * 并从每组对象里取 `name` / `test` 字面量 / `entriesAware`。三处防瞎：解析不到
 * `codeSplitting:`、解析出 0 组、`src/` 下 0 个模块，都直接判门禁自身失效（退出码 2），
 * 以免「解析漂移」伪装成「全部通过」。
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const FRONTEND_ROOT = resolve(HERE, '..')

/** 可产出 chunk 的源模块扩展名。 */
const MODULE_EXT = /\.(?:ts|tsx|vue|js|mjs|cjs)$/
const SKIP_DIRS = new Set(['node_modules', 'dist', '.vite'])

const NAME_RE = /^\s*name:\s*'([^']+)'/m
/** `test: /.../` 字面量（无 flag）的**正则体**（不含两侧斜杠），允许与 `name:` 同处一行。 */
const TEST_RE = /(?:^|[\s{,])test:\s*\/((?:[^/\\\n[]|\\.|\[(?:[^\]\\\n]|\\.)*\])+)\/\s*,?/m
const ENTRIES_AWARE_RE = /^\s*entriesAware:\s*true\s*,?\s*$/m

/** 门禁自身失效（解析漂移 / 空宇宙），与「配置真的漂了」区分开。 */
export class ChunkGateError extends Error {}

const posix = (p) => p.replace(/\\/g, '/')

/** 收集 `src/` 下所有可能成 chunk 的模块，统一成绝对 posix 路径（= test 的入参形状）。 */
export function collectModules(root) {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name))
      } else if (MODULE_EXT.test(entry.name)) {
        out.push(posix(join(dir, entry.name)))
      }
    }
  }
  walk(join(root, 'src'))
  return out.sort()
}

/** 从 `openIndex` 的 `{` 起做注释/字符串感知的括号配对，返回对象体区间。 */
function sliceBraced(text, openIndex) {
  let depth = 0
  let inLine = false
  let inBlock = false
  let quote = null
  for (let i = openIndex; i < text.length; i += 1) {
    const c = text[i]
    const n = text[i + 1]
    if (inLine) {
      if (c === '\n') inLine = false
      continue
    }
    if (inBlock) {
      if (c === '*' && n === '/') {
        inBlock = false
        i += 1
      }
      continue
    }
    if (quote) {
      if (c === '\\') i += 1
      else if (c === quote) quote = null
      continue
    }
    if (c === '/' && n === '/') {
      inLine = true
      i += 1
    } else if (c === '/' && n === '*') {
      inBlock = true
      i += 1
    } else if (c === "'" || c === '"' || c === '`') {
      quote = c
    } else if (c === '{') {
      depth += 1
    } else if (c === '}') {
      depth -= 1
      if (depth === 0) return { start: openIndex + 1, end: i }
    }
  }
  return null
}

/** 取出区间内每个深度为 0 的 `{...}` 对象体（跳过注释与字符串里的括号）。 */
function topLevelObjects(text, start, end) {
  const objects = []
  let inLine = false
  let inBlock = false
  let quote = null
  for (let i = start; i < end; i += 1) {
    const c = text[i]
    const n = text[i + 1]
    if (inLine) {
      if (c === '\n') inLine = false
      continue
    }
    if (inBlock) {
      if (c === '*' && n === '/') {
        inBlock = false
        i += 1
      }
      continue
    }
    if (quote) {
      if (c === '\\') i += 1
      else if (c === quote) quote = null
      continue
    }
    if (c === '/' && n === '/') {
      inLine = true
      i += 1
    } else if (c === '/' && n === '*') {
      inBlock = true
      i += 1
    } else if (c === "'" || c === '"' || c === '`') {
      quote = c
    } else if (c === '{') {
      const span = sliceBraced(text, i)
      if (!span) throw new ChunkGateError('分块组对象括号不平衡')
      objects.push({ text: text.slice(span.start, span.end), start: i })
      i = span.end
    }
  }
  return objects
}

/** 解析 `codeSplitting.groups` 的组对象。 */
export function parseGroups(configText) {
  const markerIndex = configText.indexOf('codeSplitting:')
  if (markerIndex < 0) throw new ChunkGateError('解析不到 `codeSplitting:` —— 门禁需要随配置结构调整')
  const openBrace = configText.indexOf('{', markerIndex)
  if (openBrace < 0) throw new ChunkGateError('`codeSplitting:` 后面没有对象字面量')
  const span = sliceBraced(configText, openBrace)
  if (!span) throw new ChunkGateError('`codeSplitting` 对象括号不平衡')

  return topLevelObjects(configText, span.start, span.end).map((object) => {
    const nameMatch = NAME_RE.exec(object.text)
    const testMatch = TEST_RE.exec(object.text)
    return {
      name: nameMatch ? nameMatch[1] : null,
      test: testMatch ? testMatch[1] : null,
      entriesAware: ENTRIES_AWARE_RE.test(object.text),
    }
  })
}

/** 按分隔符切分，遵守字符类 / 转义 / 嵌套括号（用于拆 alternation 分支）。 */
export function splitTopLevel(text, separator) {
  const parts = []
  let current = ''
  let inClass = false
  let depth = 0
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (c === '\\') {
      current += c + (text[i + 1] ?? '')
      i += 1
      continue
    }
    if (inClass) {
      if (c === ']') inClass = false
      current += c
      continue
    }
    if (c === '[') {
      inClass = true
      current += c
    } else if (c === '(') {
      depth += 1
      current += c
    } else if (c === ')') {
      depth -= 1
      current += c
    } else if (c === separator && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += c
    }
  }
  parts.push(current)
  return parts
}

/** 取出 regex 体里所有顶层 alternation，返回可直接替换成单条分支的模板。 */
export function alternationBranches(body) {
  const found = []
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== '(') continue
    let depth = 0
    let inClass = false
    let end = -1
    for (let j = i; j < body.length; j += 1) {
      const c = body[j]
      if (c === '\\') {
        j += 1
        continue
      }
      if (inClass) {
        if (c === ']') inClass = false
        continue
      }
      if (c === '[') inClass = true
      else if (c === '(') depth += 1
      else if (c === ')') {
        depth -= 1
        if (depth === 0) {
          end = j
          break
        }
      }
    }
    if (end < 0) continue
    const raw = body.slice(i + 1, end)
    const parts = splitTopLevel(raw.startsWith('?:') ? raw.slice(2) : raw, '|')
    // 只处理「纯分支集合」：≥2 条、每条非空且不含嵌套分组（嵌套会让替换失真）。
    if (parts.length >= 2 && parts.every((p) => p && !/[()]/.test(p.replace(/\\./g, '')))) {
      found.push({ prefix: body.slice(0, i + 1), suffix: body.slice(end), parts })
    }
    i = end
  }
  return found
}

/** 空宇宙防瞎：解析出的组为 0、或 `src/` 下没有模块时，门禁本身没有意义。 */
export function assertUsable(groups, files) {
  if (groups.length === 0) throw new ChunkGateError('解析出的分块组为 0 —— 门禁失去意义')
  if (files.length === 0) throw new ChunkGateError('src/ 下没有扫描到任何模块 —— 门禁失去意义')
}

/** 逐组校验活性。返回问题清单与跳过的依赖组（依赖组指向 node_modules，仓库里无从校验）。 */
export function checkGroups(groups, files) {
  const problems = []
  const skippedDependencyGroups = []
  for (const group of groups) {
    if (!group.name) throw new ChunkGateError('分块组里解析不到 name —— 解析漂移')
    if (!group.test) {
      if (group.entriesAware) continue
      throw new ChunkGateError(`分块组 \`${group.name}\` 既没有可解析的 test 字面量，也不是 entriesAware 兜底组`)
    }
    if (group.test.includes('node_modules')) {
      skippedDependencyGroups.push(group.name)
      continue
    }
    const groupRe = new RegExp(group.test)
    if (!files.some((file) => groupRe.test(file))) {
      problems.push({ group: group.name, kind: 'dead-group', detail: group.test })
      continue
    }
    for (const branch of alternationBranches(group.test)) {
      for (const part of branch.parts) {
        const branchRe = new RegExp(branch.prefix + part + branch.suffix)
        if (!files.some((file) => branchRe.test(file))) {
          problems.push({
            group: group.name,
            kind: 'dead-branch',
            detail: `${group.test}（分支 \`${part}\`）`,
          })
        }
      }
    }
  }
  return { problems, skippedDependencyGroups }
}

function main() {
  const configPath = join(FRONTEND_ROOT, 'vite.config.ts')
  const groups = parseGroups(readFileSync(configPath, 'utf8'))
  const files = collectModules(FRONTEND_ROOT)
  assertUsable(groups, files)
  const { problems, skippedDependencyGroups } = checkGroups(groups, files)

  if (problems.length > 0) {
    console.error(`分块组门禁失败：${problems.length} 处悬空匹配（域名重构搬走文件后未同步 groups）。`)
    for (const problem of problems) {
      const label = problem.kind === 'dead-group' ? '死组  ' : '死分支'
      console.error(`  ${label} [${problem.group}] ${problem.detail}`)
    }
    console.error('修法：把 test 指向文件的新位置，或删掉已无宿主的组；改完跑 bun run --cwd homeos/frontend check:deps。')
    process.exit(1)
  }

  console.log(
    `分块组活性：通过（${groups.length} 组；依赖组跳过 ${skippedDependencyGroups.length} 个、` +
      `entriesAware 兜底组无 test；对 ${files.length} 个源模块逐组校验，含 alternation 每条分支）`,
  )
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isMain) {
  try {
    main()
  } catch (error) {
    if (error instanceof ChunkGateError) {
      console.error(`分块组门禁自身失效：${error.message}`)
      process.exit(2)
    }
    throw error
  }
}
