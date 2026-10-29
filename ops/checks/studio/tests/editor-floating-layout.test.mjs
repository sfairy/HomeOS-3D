/**
 * `editor-floating-layout`（0.8.1 新增）的契约测试。
 *
 * 浮层定位错了不会报错，只会表现成「菜单飘到按钮外面」「弹窗关了菜单还在」。
 * 所以这里钉住三件事：
 *
 * 1. clamp 只在容器内落位，且空间不够时向上翻转；
 * 2. 锚点不可见的每种情况都要能被判出来（detached / dialog 关闭 / 祖先 hidden）；
 * 3. 同一 document 只允许一个浮层，开新的必须停掉旧的。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const moduleUrl = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/shared/util/editor-floating-layout.ts',
    import.meta.url,
  ),
)

const {
  clampFloatingRect,
  floatingViewport,
  floatingVisibilityProblem,
  claimFloatingLayout,
  releaseFloatingLayout,
  FLOATING_COLOR_VARIABLES,
} = await import(moduleUrl)

const viewport = { left: 0, top: 0, right: 800, bottom: 600 }
const anchorRect = (top, height = 32, left = 100, width = 120) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
})

test('clampFloatingRect：下方空间足够时贴着锚点展开', () => {
  const placement = clampFloatingRect({
    anchorRect: anchorRect(100),
    panelWidth: 200,
    panelHeight: 180,
    viewport,
    gap: 4,
  })
  assert.equal(placement.above, false)
  assert.equal(placement.left, 100)
  assert.equal(placement.top, 136)
  assert.equal(placement.width, 200)
  assert.equal(placement.maxHeight, 180)
})

test('clampFloatingRect：下方不够时翻到上方', () => {
  const placement = clampFloatingRect({
    anchorRect: anchorRect(520),
    panelWidth: 200,
    panelHeight: 180,
    viewport,
    gap: 4,
  })
  assert.equal(placement.above, true)
  assert.equal(placement.top, 520 - 4 - 180)
})

test('clampFloatingRect：容器边界内水平 clamp，宽度不超过边界', () => {
  const placement = clampFloatingRect({
    anchorRect: anchorRect(100, 32, 700, 120),
    panelWidth: 300,
    panelHeight: 120,
    viewport,
    container: { left: 40, top: 40, right: 600, bottom: 500 },
    margin: 8,
  })
  assert.equal(placement.left, 600 - 8 - 300)
  assert.equal(placement.width, 300)
})

test('clampFloatingRect：锚点完全在容器外时返回 null（调用方应关闭浮层）', () => {
  assert.equal(
    clampFloatingRect({
      anchorRect: anchorRect(700),
      panelWidth: 200,
      panelHeight: 100,
      viewport,
      container: { left: 0, top: 0, right: 800, bottom: 600 },
    }),
    null,
  )
})

test('clampFloatingRect：maxHeight 不超过可用空间', () => {
  const placement = clampFloatingRect({
    anchorRect: anchorRect(420),
    panelWidth: 200,
    panelHeight: 400,
    viewport,
    gap: 4,
    margin: 8,
  })
  assert.ok(placement.maxHeight <= 420 - 4 - 8)
})

test('floatingViewport：叠 visualViewport 偏移并取容器交集', () => {
  const view = {
    innerWidth: 1000,
    innerHeight: 700,
    visualViewport: { offsetLeft: 20, offsetTop: 10, width: 900, height: 600 },
  }
  assert.deepEqual(floatingViewport(view), { left: 20, top: 10, right: 920, bottom: 610 })
  assert.deepEqual(floatingViewport(view, { left: 100, top: 0, right: 500, bottom: 400, width: 400, height: 400 }), {
    left: 100,
    top: 10,
    right: 500,
    bottom: 400,
  })
})

function mockAnchor(overrides = {}) {
  return {
    isConnected: true,
    disabled: false,
    closest: () => null,
    getClientRects: () => [{}],
    getBoundingClientRect: () => anchorRect(100),
    ...overrides,
  }
}

test('floatingVisibilityProblem：脱离 DOM / 文档隐藏 / 禁用都判为不可见', () => {
  const doc = { hidden: false, visibilityState: 'visible' }
  assert.equal(floatingVisibilityProblem(null, doc), 'detached')
  assert.equal(floatingVisibilityProblem(mockAnchor({ isConnected: false }), doc), 'detached')
  assert.equal(floatingVisibilityProblem(mockAnchor(), { hidden: true, visibilityState: 'hidden' }), 'document-hidden')
  assert.equal(floatingVisibilityProblem(mockAnchor({ disabled: true }), doc), 'disabled')
  assert.equal(floatingVisibilityProblem(mockAnchor({ getClientRects: () => [] }), doc), 'no-layout')
})

test('floatingVisibilityProblem：祖先 hidden / dialog 关闭都判为不可见', () => {
  const doc = { hidden: false, visibilityState: 'visible' }
  assert.equal(
    floatingVisibilityProblem(mockAnchor({ closest: (selector) => (selector.includes('[hidden]') ? {} : null) }), doc),
    'ancestor-hidden',
  )
  assert.equal(
    floatingVisibilityProblem(mockAnchor({ closest: (selector) => (selector === 'dialog' ? { open: false } : null) }), doc),
    'dialog-closed',
  )
  assert.equal(
    floatingVisibilityProblem(mockAnchor({ closest: (selector) => (selector === 'dialog' ? { open: true } : null) }), doc),
    null,
  )
})

test('floatingVisibilityProblem：computedStyle 隐藏/display:none 也判为不可见', () => {
  const doc = {
    hidden: false,
    visibilityState: 'visible',
    defaultView: { getComputedStyle: () => ({ visibility: 'hidden', display: 'block' }) },
  }
  assert.equal(floatingVisibilityProblem(mockAnchor(), doc), 'invisible')
})

test('claimFloatingLayout：同一 document 只允许一个浮层', () => {
  const doc = {}
  const log = []
  const make = (name) => ({ position: () => true, start() {}, stop: () => log.push(name), dispose() {} })
  const first = make('first')
  const second = make('second')
  claimFloatingLayout(doc, first)
  claimFloatingLayout(doc, second)
  assert.deepEqual(log, ['first'])
  releaseFloatingLayout(doc, first)
  claimFloatingLayout(doc, make('third'))
  assert.deepEqual(log, ['first', 'second'])
})

test('FLOATING_COLOR_VARIABLES：覆盖床/气候强调色透传', () => {
  assert.ok(FLOATING_COLOR_VARIABLES.includes('--hb-bed-accent'))
  assert.ok(FLOATING_COLOR_VARIABLES.includes('--hb-climate-accent'))
  assert.ok(FLOATING_COLOR_VARIABLES.includes('--hb-climate-accent-soft'))
})
