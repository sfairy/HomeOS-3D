/**
 * legacy-scope：引导期间挂到 document.body 的节点在 dispose 时必须摘除。
 *
 * 回归：户型图绘制把 #base-light-controls 搬到 body 后从不归还，面板按钮上的监听闭包
 * 持有整个引导作用域，每进出一次 /3d-studio 就泄漏一整套 DOM 与 three.js 画布。
 */
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'

class FakeBody {
  children = []
  append(...nodes) {
    for (const node of nodes) this.appendChild(node)
  }
  appendChild(node) {
    node.parentNode?.removeChild(node)
    this.children.push(node)
    node.parentNode = this
    return node
  }
  insertBefore(node) {
    return FakeBody.prototype.appendChild.call(this, node)
  }
  removeChild(node) {
    this.children = this.children.filter((child) => child !== node)
    node.parentNode = null
    return node
  }
}

const node = (name) => ({ name, parentNode: null })
const body = new FakeBody()
globalThis.document = { body }
const { createLegacyScope } = await import('../../../../homeos/frontend/src/studio/platform/legacy-scope.ts')

afterEach(() => {
  body.children = []
})

test('引导期及之后 append 到 body 的节点在 dispose 时摘除，dispose 后恢复原生方法', () => {
  const scope = createLegacyScope('test')
  const panel = node('panel')
  scope.executeInLegacyScope(() => body.append(panel))
  const lateDialog = node('dialog')
  body.appendChild(lateDialog)
  assert.deepEqual(body.children, [panel, lateDialog])

  scope.dispose()
  assert.deepEqual(body.children, [])
  assert.equal(Object.hasOwn(body, 'append'), false)
  assert.equal(Object.hasOwn(body, 'appendChild'), false)
})

test('外壳经 insertBefore 挂的节点与已被移走的节点不受影响', () => {
  const scope = createLegacyScope('test')
  const teleported = node('teleported')
  const moved = node('moved')
  scope.executeInLegacyScope(() => body.append(moved))
  body.insertBefore(teleported, null)
  moved.parentNode.removeChild(moved)

  scope.dispose()
  assert.deepEqual(body.children, [teleported])
})

test('并存的两个作用域各自只回收自己登记的节点', () => {
  const outer = createLegacyScope('outer')
  const inner = createLegacyScope('inner')
  const outerNode = node('outer')
  const innerNode = node('inner')
  outer.executeInLegacyScope(() => body.append(outerNode))
  inner.executeInLegacyScope(() => body.append(innerNode))

  inner.dispose()
  assert.deepEqual(body.children, [outerNode])
  assert.equal(Object.hasOwn(body, 'append'), true)
  outer.dispose()
  assert.deepEqual(body.children, [])
  assert.equal(Object.hasOwn(body, 'append'), false)
})
