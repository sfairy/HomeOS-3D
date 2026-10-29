/**
 * 上游对比工具链（`ops/port/project-map.mjs` / `ops/port/symbol-diff.mjs`）的契约测试。
 *
 * 这两个脚本决定了「审计报告说缺什么」，判错的方式有两种，且都不会自己报错：
 *
 * - **假阳性**：把已经移植的模块报成缺失（上一轮 `missing` 里 72 条有一大半是这种），
 *   代价是审计白跑一遍；
 * - **假阴性**：把没移植的导出算成命中，代价是缺口被静默放过 —— 这种更危险。
 *
 * 所以这里只锁三件最容易错的事：
 * 1. 导出抽取不能把类方法 / 对象属性当成模块导出（假阴性来源）；
 * 2. 改名落点必须优先于 basename 匹配（假阳性来源）；
 * 3. 0.8.0 → 0.8.1 新增的导出必须能被打出（否则「增量」这一层等于没做）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const projectMapUrl = fileURLToPath(new URL('../../../port/project-map.mjs', import.meta.url))
const symbolDiffUrl = fileURLToPath(new URL('../../../port/symbol-diff.mjs', import.meta.url))
const { classifyStatus } = await import(projectMapUrl)
const { camelCase, kebabCase, symbolVariants, extractUpstreamSymbols, diffSymbols } = await import(
  symbolDiffUrl
)

test('classifyStatus：同名命中优先于改名落点与架构差异', () => {
  // 同名只有一个：机械对齐，哪怕同时登记了改名落点
  assert.equal(classifyStatus({ hits: ['a.ts'], overrideTargets: [], structural: null }), 'mechanical')
  // 同名多个：一拆多
  assert.equal(
    classifyStatus({ hits: ['a.ts', 'b.ts'], overrideTargets: ['c.ts'], structural: null }),
    'renamed',
  )
})

test('classifyStatus：改名落点优先于架构差异（落点存在就说明确实移植了）', () => {
  assert.equal(
    classifyStatus({ hits: [], overrideTargets: ['src/x.ts'], structural: '厂商 SaaS' }),
    'overridden',
  )
})

test('classifyStatus：既无同名也无落点才算待解释', () => {
  assert.equal(classifyStatus({ hits: [], overrideTargets: [], structural: null }), 'missing')
  assert.equal(classifyStatus({ hits: [], overrideTargets: [], structural: '架构差异' }), 'structural')
})

test('导出抽取：类方法与对象属性不算模块导出', () => {
  const source = `
export class UpdateChecker {
  constructor() {}
  releaseValue() {}
}
export function haControlTimeout() {}
const internal = { registerUIPackRuntime() {} }
export const USER_IMAGE_UPLOAD_HINT = 'x'
`
  const { exports } = extractUpstreamSymbols(source)
  assert.deepEqual(exports.sort(), ['USER_IMAGE_UPLOAD_HINT', 'UpdateChecker', 'haControlTimeout'])
  // 方法名与对象属性都不应出现
  for (const method of ['constructor', 'releaseValue', 'registerUIPackRuntime']) {
    assert.equal(exports.includes(method), false, method + ' 不该被当成导出')
  }
})

test('导出抽取：export { a as b } 取对外的 b，default as 也一样', () => {
  const source = `
export {
  s as interaction3dControlTimeout,
  u as requestHAControl
};
export { default as applyUiPackToDocument };
export { localOnly };
`
  const { exports } = extractUpstreamSymbols(source)
  assert.deepEqual(
    exports.sort(),
    ['applyUiPackToDocument', 'interaction3dControlTimeout', 'localOnly', 'requestHAControl'],
  )
  // 对外的名字取了，内部名字不该混进来
  assert.equal(exports.includes('s'), false)
  assert.equal(exports.includes('u'), false)
})

test('导出抽取：契约串与数字常量一并带出', () => {
  const source = `
export const MAX_RESPONSE_BYTES = 32768;
export const MIN_EDGE = 8192;
const raw = 7;
export function startCameraImageStream() {}
const headers = { 'x-hb-camera-stream': 'frames', 'x-hb-camera-content-type': 'image/jpeg' };
`
  const { contracts, numericConsts } = extractUpstreamSymbols(source)
  assert.deepEqual(contracts.sort(), ['x-hb-camera-content-type', 'x-hb-camera-stream'])
  assert.equal(numericConsts.get('MAX_RESPONSE_BYTES'), 32768)
  assert.equal(numericConsts.get('MIN_EDGE'), 8192)
  // 小写局部变量不是常量表的一部分
  assert.equal(numericConsts.has('raw'), false)
})

test('写法变体：全大写常量要能匹配到大驼峰实现', () => {
  // 上游 `USER_IMAGE_UPLOAD_LIMITS` 在本项目是 `USER_IMAGE_MAX_BYTES` 这类改名，
  // 变体表至少保证「同一个名字换了写法」不会被判成缺失。
  assert.equal(camelCase('LIGHT_STATISTICS_ENTITY_LIMIT'), 'lightStatisticsEntityLimit')
  assert.equal(kebabCase('createScaledPopupMenu'), 'create-scaled-popup-menu')
  const variants = symbolVariants('LIGHT_STATISTICS_ENTITY_LIMIT')
  assert.ok(variants.includes('LIGHT_STATISTICS_ENTITY_LIMIT'))
  assert.ok(variants.includes('lightStatisticsEntityLimit'))
  // 太短的名字只用原样，避免 `on` / `id` 这类误命中
  assert.deepEqual(symbolVariants('on'), ['on'])
})

test('0.8.1 增量：新增导出必须能被识别出来', () => {
  const before = extractUpstreamSymbols(`
export function interaction3dControlTimeout() {}
export const OLD_LIMIT = 100;
`)
  const after = extractUpstreamSymbols(`
export function haControlTimeout() {}
export function interaction3dControlTimeout() {}
export const OLD_LIMIT = 100;
`)
  const { newExports } = diffSymbols(before, after)
  assert.deepEqual(newExports, ['haControlTimeout'])
  // 没变的名字不算新增
  assert.equal(newExports.includes('interaction3dControlTimeout'), false)
})

test('0.8.1 增量：空基线（新文件）时全部算新增', () => {
  const after = extractUpstreamSymbols('export function createScaledPopupMenu() {}\n')
  const { newExports } = diffSymbols({ exports: [], contracts: [] }, after)
  assert.deepEqual(newExports, ['createScaledPopupMenu'])
})
