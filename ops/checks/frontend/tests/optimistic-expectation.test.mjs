/**
 * 乐观更新「目标态是否已满足」判定回归。
 *
 * 背景（真实故障）：批量「全部关闭」会对分组里**每一盏**灯下发 turn_off，包括本来就
 * 关着的。HA 不会为「状态没变」发 state_changed，前端却照样建立了乐观态并布了 TTL：
 * 3s 后必然弹一次「未生效，已恢复」，屏幕上就是一片假告警。
 * 短路判据必须是「预测 ⊆ 现值」：太松 → 误报；太严 → 漏掉真实属性变更。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const FRONTEND_SRC = new URL('../../../../homeos/frontend/src/', import.meta.url)
const SHARED_SRC = new URL('../../../../packages/shared/src/', import.meta.url)

/**
 * 被测模块只依赖 @homeos/shared 与 @ 别名。被测机构建产物（dist）是给打包器用的
 * （含无扩展名的目录 import），Node ESM 解析不了，因此这里把两条别名指到源码，
 * 并给无扩展名的相对 import 补上 .ts。
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@homeos/shared') {
      return { url: new URL('index.ts', SHARED_SRC).href, shortCircuit: true }
    }
    if (specifier.startsWith('@/')) {
      return { url: new URL(specifier.slice(2), FRONTEND_SRC).href, shortCircuit: true }
    }
    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      context.parentURL &&
      !/\.(ts|js|mjs|json|vue)$/.test(specifier)
    ) {
      const base = new URL(specifier, context.parentURL)
      for (const candidate of [`${base.href}.ts`, `${base.href}/index.ts`]) {
        if (existsSync(fileURLToPath(candidate))) return { url: candidate, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context)
  },
})

const { optimisticExpectationSatisfied } = await import(
  pathToFileURL(
    fileURLToPath(new URL('stores/entities/optimistic-expectation.util.ts', FRONTEND_SRC)),
  ).href
)

const lightOff = { entity_id: 'light.a', state: 'off', attributes: { brightness: 0 } }
const lightOn = { entity_id: 'light.a', state: 'on', attributes: { brightness: 200 } }

test('对已经关闭的灯再下发 turn_off：目标态已满足，不应建立乐观态', () => {
  assert.equal(optimisticExpectationSatisfied({ state: 'off' }, lightOff), true)
})

test('对开着的灯下发 turn_off：目标态未满足，必须建立乐观态等确认', () => {
  assert.equal(optimisticExpectationSatisfied({ state: 'off' }, lightOn), false)
})

test('state 命中但预测属性不同：仍算未满足（真的要去改亮度）', () => {
  assert.equal(
    optimisticExpectationSatisfied({ state: 'on', attributes: { brightness: 128 } }, lightOn),
    false,
  )
})

test('state 与属性都命中现有值：已满足', () => {
  assert.equal(
    optimisticExpectationSatisfied({ state: 'on', attributes: { brightness: 200 } }, lightOn),
    true,
  )
})

test('属性数值容差与 attrValueEquals 同语义（差 1 视为未变）', () => {
  assert.equal(
    optimisticExpectationSatisfied({ state: 'on', attributes: { brightness: 201 } }, lightOn),
    true,
  )
})

test('空预测视为已满足（没有可等的东西）', () => {
  assert.equal(optimisticExpectationSatisfied({}, lightOn), true)
  assert.equal(optimisticExpectationSatisfied(undefined, lightOn), true)
})

test('实体缺失时无法判定为已满足（宁可按未满足处理，保留操作反馈）', () => {
  assert.equal(optimisticExpectationSatisfied({ state: 'off' }, undefined), false)
  assert.equal(optimisticExpectationSatisfied({ state: 'off' }, null), false)
})
