/**
 * `check_giant_files` 的度量逻辑单元测试（`bun test`）。
 *
 * 这条门禁的结论会被用来决定「先拆哪个巨型文件」，所以它的口径必须可验证：
 * 依赖条目数错了，就会把耦合最重的文件排到后面。
 */
import { describe, expect, test } from 'bun:test'
import { writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { measure } from '../size/check_giant_files.mjs'

function measureSource(source: string) {
  const directory = mkdtempSync(join(tmpdir(), 'giant-'))
  const file = join(directory, 'sample.ts')
  writeFileSync(file, source, 'utf8')
  return measure(file)
}

describe('measure: 扇出统计', () => {
  test('无依赖函数时 depsEntries 为 0', () => {
    const found = measureSource('const a = 1\nfunction foo() { return a }\n')
    expect(found.depsFns).toBe(0)
    expect(found.depsEntries).toBe(0)
  })

  test('统计 deps 函数的条目数（跳过注释与空行）', () => {
    const found = measureSource(
      [
        'function foo(...args: any[]): any {',
        '  return (fooImpl as any)(fooDeps(), ...args)',
        '}',
        'function fooDeps(): FooDeps {',
        '  return {',
        '    alpha,',
        '    beta: 1,',
        '    // 注释不算',
        '',
        '    gamma: () => delta(),',
        '  }',
        '}',
        '',
      ].join('\n'),
    )
    expect(found.depsFns).toBe(1)
    expect(found.depsEntries).toBe(3)
  })

  test('多个 deps 函数累加', () => {
    const found = measureSource(
      [
        'function aDeps() {',
        '  return {',
        '    x,',
        '  }',
        '}',
        'function bDeps() {',
        '  return {',
        '    y,',
        '    z,',
        '  }',
        '}',
        '',
      ].join('\n'),
    )
    expect(found.depsFns).toBe(2)
    expect(found.depsEntries).toBe(3)
  })

  test('import 按语句计：多行 import 只算开头的 import 行', () => {
    const found = measureSource(
      [
        "import { a } from './a'",
        'import {',
        '  b,',
        "} from './b'",
        "import type { C } from './c'",
        "from './d'",
        '',
      ].join('\n'),
    )
    // 三条语句：`./a`、跨行的 `./b`（只算 `import {` 那一行）、`./c`。
    // 带前导空白的 `from './d'` 是续行，不计。
    expect(found.imports).toBe(3)
  })

  test('行数按换行符计（末尾换行不多算一行）', () => {
    expect(measureSource('a\nb\n').lines).toBe(2)
    expect(measureSource('a\nb').lines).toBe(1)
  })
})
