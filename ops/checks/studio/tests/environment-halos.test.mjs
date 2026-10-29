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
const { simplifyOutline, orderedContourPointIndices } = await import(moduleUrl)

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
  // 用 5 个点：上游从 5 个点起才简化，4 点以内一律原样返回（四边形削一下就没形了）。
  const nearLine = [
    [0, 0],
    [3, 0.3],
    [7, 0.2],
    [10, 0.1],
    [20, 0],
  ]
  const offLine = [
    [0, 0],
    [3, 0.3],
    [5, 1],
    [10, 0],
    [20, 0],
  ]
  assert.equal(simplifyOutline(nearLine).length, 2)
  // 凸起的 [5,1] 偏离基线 1px > 0.45：必须留在结果里（具体保留几个取决于后续分段，
  // 这里只断言「拐点没被削掉」）。
  const offLineResult = simplifyOutline(offLine)
  assert.ok(offLineResult.length > 2)
  assert.ok(offLineResult.some((point) => point[0] === 5 && point[1] === 1))
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

test('有序轮廓只认几何 userData：帘布按上沿去、下沿回的顺序闭合成一条', () => {
  // 模型类型是 `curtain` 不代表能有序连；决定权在几何上（早期实现拿类型去比
  // `curtainCloth`，永远不命中，所以帘布一直退化成凸包）。
  assert.equal(orderedContourPointIndices({}), null)
  assert.equal(orderedContourPointIndices({ environmentModelType: 'curtainCloth' }), null)

  const clothIndices = orderedContourPointIndices({ curtainCloth: { segments: 3 } })
  assert.equal(clothIndices.length, 1, '一块帘布是一条闭合轮廓')
  // segments=3 → 每侧 4 个点：上沿 0,1,2,3，下沿 7,6,5,4；顶点总数 2*(segments+1)
  assert.deepEqual(clothIndices[0], [0, 1, 2, 3, 7, 6, 5, 4])
  assert.equal(new Set(clothIndices[0]).size, clothIndices[0].length, '轮廓不能重复取点')

  // 梦幻帘：每片叶子一个四边面，顺序必须是 0,1,3,2 才成环（0,1,2,3 会交叉）。
  const bladeIndices = orderedContourPointIndices({ dreamBlades: { count: 2 } })
  assert.equal(bladeIndices.length, 2)
  assert.deepEqual(bladeIndices[0], [0, 1, 3, 2])
  assert.deepEqual(bladeIndices[1], [4, 5, 7, 6])

  // 两种标记同时存在时帘布优先（一块帘布不会又是叶片）。
  assert.deepEqual(orderedContourPointIndices({ curtainCloth: { segments: 1 }, dreamBlades: { count: 1 } })[0], [
    0, 1, 3, 2,
  ])
})
