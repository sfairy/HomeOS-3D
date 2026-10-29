/**
 * `componentHostGeometry`（0.8.2 新增）的契约测试。
 *
 * 这个函数把「组件宿主该长在哪、多大、怎么变换」压缩成一个纯函数，唯一的目的是让
 * **放大后的纯文字组件（标题 / 统计 / 天气）改用 CSS `zoom` 重新栅格化**，而不是把
 * 已经画好的图层拉大（后者文字必然发糊）。
 *
 * 风险点全在坐标换算上，出错的表现是「放大后组件整体偏移、拖拽对不上、fill 布局错位」，
 * 都不会抛异常。所以这里钉死：
 *
 * 1. 只有白名单类型 + 非编辑态 + 浏览器支持 zoom 时才写 `zoom`，其余一律退回 `transform: scale`；
 * 2. `zoom` 生效时 `left/top` 必须按 `(x + w*(1-z)/2)/z` 反算回缩放前坐标系（中心不变）；
 * 3. 两条路径的最终视觉倍率必须一致 —— `zoom * scale/zoom === scale`。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const moduleUrl = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/app/renderer/geometry/transform-geometry.ts', import.meta.url),
)
const { componentHostGeometry } = await import(moduleUrl)

const component = (type, overrides = {}) => ({
  id: 'c-' + type,
  type,
  style: { scale: 1 },
  ...overrides,
})

const position = { x: 100, y: 50, width: 200, height: 40, rotation: 0 }

test('未放大的组件不写 zoom，transform 只留 rotate + scale(1)', () => {
  const geometry = componentHostGeometry(component('title-button'), position, { supportsZoom: true })
  assert.equal(geometry.zoom, '', '倍率为 1 时不该写 zoom')
  assert.equal(geometry.left, '100px')
  assert.equal(geometry.top, '50px')
  assert.equal(geometry.width, '200px')
  assert.equal(geometry.height, '40px')
  assert.equal(geometry.transform, 'rotate(0deg) scale(1)')
})

test('白名单类型放大时用 zoom，left/top 反算到缩放前坐标系', () => {
  const host = component('title-button', { style: { scale: 2 } })
  const geometry = componentHostGeometry(host, position, { supportsZoom: true })
  assert.equal(geometry.zoom, '2')
  // (100 + 200*(1-2)/2)/2 = 0，即缩放后仍然落在原来的位置。
  assert.equal(geometry.left, '0px')
  // (50 + 40*(1-2)/2)/2 = 15
  assert.equal(geometry.top, '15px')
  assert.equal(geometry.transform, 'rotate(0deg) scale(1)', 'zoom 已经承担了倍率，transform 必须回到 1')
})

test('zoom × transform 的合倍率始终等于 style.scale', () => {
  for (const type of ['title-button', 'light-statistics', 'weather']) {
    for (const scale of [1.5, 2, 3, 5]) {
      const geometry = componentHostGeometry(component(type, { style: { scale } }), position, {
        supportsZoom: true,
      })
      const transformScale = Number(/scale\(([^)]+)\)/.exec(geometry.transform)[1])
      const zoom = geometry.zoom === '' ? 1 : Number(geometry.zoom)
      assert.equal(zoom * transformScale, scale, `${type} @ ${scale}x`)
    }
  }
})

test('非白名单类型即使放大也不写 zoom（退回位图放大）', () => {
  for (const type of ['image', 'interaction3d', 'flow-line', 'camera', 'group']) {
    const geometry = componentHostGeometry(component(type, { style: { scale: 3 } }), position, {
      supportsZoom: true,
    })
    assert.equal(geometry.zoom, '', type)
    assert.equal(geometry.transform, 'rotate(0deg) scale(3)', type)
    assert.equal(geometry.left, '100px', '没有 zoom 时不该改坐标')
  }
})

test('编辑态 / fill 布局 / 浏览器不支持 zoom 时一律不上 zoom', () => {
  const host = component('weather', { style: { scale: 2 } })
  assert.equal(componentHostGeometry(host, position, { supportsZoom: true, editable: true }).zoom, '')
  assert.equal(componentHostGeometry(host, position, { supportsZoom: false }).zoom, '')
  assert.equal(componentHostGeometry(host, position, { supportsZoom: true, layoutIsFill: true }).zoom, '')
  // fill 布局是铺满画布，倍率恒为 1，哪怕没显式关掉也要按 1 处理。
  assert.equal(
    componentHostGeometry(host, position, { supportsZoom: true, layoutIsFill: true }).transform,
    'rotate(0deg) scale(1)',
  )
})

test('scale 被夹在 [0.01, 5]，rotation 原样透传', () => {
  const clampedHigh = componentHostGeometry(
    component('weather', { style: { scale: 99 } }),
    { ...position, rotation: 30 },
    { supportsZoom: true },
  )
  assert.equal(clampedHigh.zoom, '5')
  assert.equal(clampedHigh.transform, 'rotate(30deg) scale(1)')

  const clampedLow = componentHostGeometry(
    component('title-button', { style: { scale: 0 } }),
    position,
    { supportsZoom: true },
  )
  // `scale: 0` 走的是 `|| 1` 的默认值（上游同样如此），不是夹到 0.01 —— 别在这里「顺手修好」，
  // 改了会让历史文档里 scale=0 的组件突然缩成一个点。
  assert.equal(clampedLow.zoom, '')
  assert.equal(clampedLow.transform, 'rotate(0deg) scale(1)')
})

test('缺省入参：position 回落到组件自身，宽高默认 100', () => {
  const geometry = componentHostGeometry({
    type: 'title-button',
    position: { x: 7, y: 8 },
    style: { scale: 1 },
  })
  assert.equal(geometry.left, '7px')
  assert.equal(geometry.top, '8px')
  assert.equal(geometry.width, '100px')
  assert.equal(geometry.height, '100px')
})
