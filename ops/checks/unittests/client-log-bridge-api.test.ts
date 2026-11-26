/**
 * `HomeOSLog` 的**声明**与**实现**必须一致（现场缺陷回归）。
 *
 * 现象：`Uncaught (in promise) TypeError: globalThis.window?.HomeOSLog?.[...] is not a function`。
 *
 * 真因是声明与实现漂移：
 * - `vite-env.d.ts` 声明了 `info / warn / error / debug / linkError / setContext / report`；
 * - 运行时对象（`client-log.ts`）只挂了 `report / error / linkError / flush / setContext`。
 *
 * 于是全站十余处 `HomeOSLog?.warn?.(...)` 的可选调用**全部静默失败** ——
 * 警告一条都到不了服务端，而 `tsc` 因为声明里写着存在，也不会报错。
 * 这类漂移只能靠对比两份清单发现，所以固化成门禁。
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dir, '../../..')
const TYPE_DECLARATION = readFileSync(resolve(REPO_ROOT, 'homeos/frontend/src/studio/vite-env.d.ts'), 'utf8')
const RUNTIME_BRIDGE = readFileSync(resolve(REPO_ROOT, 'homeos/frontend/src/studio/app/logging/client-log.ts'), 'utf8')

/** `interface HomeOSLog { ... }` 里声明的方法名。 */
function declaredMethods(): string[] {
  const interfaceBody = /interface HomeOSLog \{([\s\S]*?)\n\}/.exec(TYPE_DECLARATION)?.[1] ?? ''
  return [...interfaceBody.matchAll(/^\s{2}(\w+)\?:/gm)].map((match) => match[1]).sort()
}

/** 运行时 `bridgeWindow.HomeOSLog = { ... }` 里挂上的键名。 */
function implementedMethods(): string[] {
  const objectBody = /bridgeWindow\.HomeOSLog = \{([\s\S]*?)\n\s{4}\}/.exec(RUNTIME_BRIDGE)?.[1] ?? ''
  return [...objectBody.matchAll(/^\s{6}(\w+):/gm)].map((match) => match[1]).sort()
}

describe('HomeOSLog 声明与实现对齐', () => {
  test('两边解析出了方法名（否则断言会变成空对空）', () => {
    expect(declaredMethods().length).toBeGreaterThan(0)
    expect(implementedMethods().length).toBeGreaterThan(0)
  })

  test('每个声明的方法都有实现（缺一个就会是 "is not a function"）', () => {
    expect(implementedMethods()).toEqual(expect.arrayContaining(declaredMethods()))
  })

  test('warn / info / debug 都已实现', () => {
    // 单独再锁一遍：这三个曾长期只存在于声明里，十余处调用静默丢失。
    expect(implementedMethods()).toEqual(expect.arrayContaining(['warn', 'info', 'debug']))
  })
})
