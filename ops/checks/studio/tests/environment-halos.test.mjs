/**
 * `environment-halos` 的轮廓几何契约（0.8.1 B4）。
 *
 * 描边每帧都要重算，两个点一旦判错都不会报错，只会让画面「毛刺」或「糊掉」：
 *
 * - 简化太狠：直线被削掉，轮廓塌成三角形；
 * - 简化太松：上千个点拼 path，长帘布直接掉帧；
 * - 凹模型用了凸包：帘布开口、梦幻帘叶片、扫地机风机被抹平。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const moduleUrl = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/runtime/environment/environment-halos.ts',
    import.meta.url,
  ),
)
const { simplifyOutline, orderedOutline, outlineUsesOrderedContour } = await import(moduleUrl)

test('simplifyOutline：共线中点被削掉，端点保留', () => {
  const square = [
    [0, 0],
    [5, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ]
  const simplified = simplifyOutline(square)
  assert.deepEqual(
    simplified.map((point) => point.join(',')),
    ['0,0', '10,0', '10,10', '0,10'],
  )
  assert.equal(simplified[0], square[0])
  assert.equal(simplified.at(-1), square.at(-1))
})

test('simplifyOutline：0.45 容差内外的分界', () => {
  // 偏移 0.3 < 0.45：视为共线；偏移 1 > 0.45：必须保留。
  const nearLine = [
    [0, 0],
    [3, 0.3],
    [7, 0.2],
    [10, 0],
  ]
  const offLine = [
    [0, 0],
    [3, 0.3],
    [5, 1],
    [10, 0],
  ]
  assert.equal(simplifyOutline(nearLine).length, 2)
  assert.equal(simplifyOutline(offLine).length, 3)
})

test('simplifyOutline：少于四个点原样返回且不改入参', () => {
  const triangle = [
    [0, 0],
    [1, 1],
    [2, 0],
  ]
  const result = simplifyOutline(triangle)
  assert.deepEqual(result, triangle)
  assert.notEqual(result, triangle)
  assert.deepEqual(simplifyOutline([]), [])
})

test('orderedOutline：按质心极角排序，保留全部点', () => {
  const concave = [
    [0, 0],
    [10, 0],
    [10, 10],
    [5, 2], // 凹口：凸包会把它削掉
    [0, 10],
  ]
  const ordered = orderedOutline(concave)
  assert.equal(ordered.length, concave.length)
  assert.deepEqual(
    new Set(ordered.map((point) => point.join(','))),
    new Set(concave.map((point) => point.join(','))),
  )
  const center = concave.reduce(
    (accumulator, point) => [accumulator[0] + point[0] / concave.length, accumulator[1] + point[1] / concave.length],
    [0, 0],
  )
  const angles = ordered.map((point) => Math.atan2(point[1] - center[1], point[0] - center[0]))
  for (let index = 1; index < angles.length; index += 1)
    assert.ok(angles[index - 1] <= angles[index], `${angles[index - 1]} > ${angles[index]}`)
})

test('有序轮廓类型：帘布 / 梦幻帘 / 风机，其余走凸包', () => {
  for (const type of ['curtainCloth', 'dreamBlades', 'rotor'])
    assert.equal(outlineUsesOrderedContour(type), true, type)
  for (const type of ['curtain', 'fan', 'door', undefined, ''])
    assert.equal(outlineUsesOrderedContour(type), false, String(type))
})
