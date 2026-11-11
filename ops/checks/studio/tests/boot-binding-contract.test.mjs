import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

/**
 * `studio-app/boot.ts` 转发层的结构契约。
 *
 * 背景：这个文件把约 500 个实现函数转发给宿主闭包。转发只有三种形态，任何一处漏写都会
 * 变成运行期 `undefined`（typecheck 看不见：转发体全是 `any`）。计划要做的
 * `bindRuntime(runtime, impls)` 重写会一次性动这 500 行，**必须先有一条能证明「一个都没丢」
 * 的检查**，否则只能靠肉眼比对。
 *
 * 这里冻结各项计数，只允许**下降**（重写推进时同步下调）：
 * 新增转发会立刻失败，提醒把它登记进本文件的预期值。
 */

const SOURCE = new URL(
  '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/boot.ts',
  import.meta.url,
)
const src = readFileSync(SOURCE, 'utf8')

/** 重写 `bindRuntime` 时逐批下调这些数字；不可上调。 */
const FROZEN = {
  /** `const x = (...args) => (xImpl as any)(studioRuntime, ...args)` */
  studioRuntime: 480,
  /** `function x(...args) { ... (xImpl as any)(xDeps(), ...args) }` */
  deps: 16,
  /** `const x = (): void => { xImpl(studioRuntime) }` */
  void0: 1,
}

/** 唯一允许「转发名 ≠ 实现名 + Impl」的例外，理由写在注释里。 */
const ALIAS_ALLOWLIST = new Map([
  // 保存一次与「保存」共用同一个实现：前者是「立刻落盘一次」的窄入口。
  ['flushStudioSaveOnce', 'runStudioSaveOnceImpl'],
])

function implImports() {
  const found = new Set()
  for (const match of src.matchAll(/import\s*(?:type\s*)?\{([\s\S]*?)\}\s*from\s*['"][^'"]+['"]/g)) {
    for (const part of match[1].split(',')) {
      const trimmed = part.trim()
      if (!trimmed || trimmed.startsWith('type ')) continue
      const alias = trimmed.split(/\s+as\s+/)
      if (alias.length === 2 && alias[1].trim().endsWith('Impl')) found.add(alias[1].trim())
    }
  }
  return found
}

/**
 * 形态 2 的写法不统一（`return (...)` / 先存到局部变量 / 带前置语句），所以不按整行匹配，
 * 而是先定位每个 `function X(...args: any[]): any {`，再在函数头之后 400 字符内找
 * `(XImpl as any)(XDeps(), ...args)`。
 */
function depsForwarders() {
  const found = []
  for (const match of src.matchAll(/function\s+([\w$]+)\(\.\.\.args: any\[\]\)[^{]*\{/g)) {
    const window = src.slice(match.index, match.index + 400)
    const call = window.match(/\(?([\w$]+) as any\)?\(\s*([\w$]+)Deps\(\),\s*\.\.\.args\s*\)/)
    if (call) found.push({ name: match[1], impl: call[1] })
  }
  return found
}

const FORMS = {
  studioRuntime: [
    ...src.matchAll(
      /const\s+([\w$]+)\s*=\s*\(\.\.\.args: any\[\]\): any => \(([\w$]+) as any\)\(studioRuntime, \.\.\.args\)/g,
    ),
  ].map((hit) => ({ name: hit[1], impl: hit[2] })),
  deps: depsForwarders(),
  void0: [...src.matchAll(/const\s+([\w$]+)\s*=\s*\(\): void => \{\s*([\w$]+)\(studioRuntime\);/g)].map((hit) => ({
    name: hit[1],
    impl: hit[2],
  })),
}

const forwarders = Object.entries(FORMS).flatMap(([kind, hits]) => hits.map((hit) => ({ ...hit, kind })))

describe('boot.ts 转发层契约', () => {
  test('三种形态的计数与冻结值一致（减少时请同步下调 FROZEN）', () => {
    for (const [kind, expected] of Object.entries(FROZEN)) {
      expect({ kind, count: FORMS[kind].length }).toEqual({ kind, count: expected })
    }
  })

  test('每个转发的实现都是 import 进来的 *Impl', () => {
    const imported = implImports()
    const unknown = forwarders.filter((f) => !imported.has(f.impl)).map((f) => f.impl)
    expect(unknown).toEqual([])
  })

  test('转发名与实现名一一对应（例外需登记）', () => {
    const mismatched = forwarders
      .filter((f) => `${f.name}Impl` !== f.impl)
      .filter((f) => ALIAS_ALLOWLIST.get(f.name) !== f.impl)
      .map((f) => `${f.name} -> ${f.impl}`)
    expect(mismatched).toEqual([])
  })

  test('没有重复的转发名（重复 const 会在运行期静默覆盖）', () => {
    const names = forwarders.map((f) => f.name)
    const duplicated = names.filter((name, index) => names.indexOf(name) !== index)
    expect(duplicated).toEqual([])
  })

  test('每个 *Impl 都真的被用到（防止 import 了却没接上）', () => {
    const unused = [...implImports()].filter((impl) => {
      const uses = src.match(new RegExp(`\\b${impl.replace(/\$/g, '\\$')}\\b`, 'g')) || []
      return uses.length < 2 // 一次 import + 至少一次使用
    })
    expect(unused).toEqual([])
  })

  test('冻结表与实测总数自洽', () => {
    const expected = Object.values(FROZEN).reduce((sum, value) => sum + value, 0)
    expect(forwarders.length).toBe(expected)
  })
})
