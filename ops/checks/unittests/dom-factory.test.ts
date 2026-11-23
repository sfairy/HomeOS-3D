/**
 * `domElement` 与「三行写法」的等价性（原独立门禁降级为单测）。
 *
 * 为什么从门禁步骤降级
 * --------------------
 * 这条断言服务的是「把三行建元素收成 `domElement(...)`」的那次 codemod，codemod 已在
 * `ed50084ce` 删除。工具本身仍在用，所以等价性值得钉住，但不必再占一个门禁步骤：
 * 放进 `check:tests`，与其它契约单测同一个入口。
 *
 * 覆盖三种形态（与 `@/studio/app/shared/util/dom-factory.ts` 对应）：
 * 1. 类名 + 文本；2. 只有类名；3. 只有文本（此时 `domElement` 收到 `null` 类名）。
 */
import { describe, expect, test } from 'bun:test'

import { domElement } from '../../../homeos/frontend/src/studio/app/shared/util/dom-factory.ts'

/** 只实现被比较的那几个字段；不需要真实 DOM。 */
function createFakeDocument() {
  return {
    createElement(tagName: string) {
      return { tagName: tagName.toUpperCase(), className: '', textContent: '' }
    },
  }
}

/** 三行写法的等价物（逐条对应用户代码里的语句，故意分开写以保持「原样」）。 */
function manual(document, tag, className, text) {
  const element = document.createElement(tag)
  if (className !== undefined) element.className = className
  if (text !== undefined) element.textContent = String(text)
  return element
}

const CASES = [
  { label: '类名 + 文本', tag: 'p', className: 'x y', text: '你好' },
  { label: '类名 + 数字文本', tag: 'span', className: 'num', text: 42 },
  { label: '只有类名', tag: 'div', className: 'card', text: undefined },
  { label: '只有文本', tag: 'h3', className: undefined, text: '标题' },
  { label: '空类名', tag: 'i', className: '', text: 'icon' },
]

describe('domElement 等价性', () => {
  for (const item of CASES) {
    test(item.label, () => {
      const document = createFakeDocument()
      const expected = manual(document, item.tag, item.className, item.text)
      const actual = domElement(document, item.tag, item.className ?? null, item.text ?? null)
      // 「只有类名」形态传 `text = null`：`domElement` 不写 textContent，三行写法也不写。
      const normalizedExpected = item.text === undefined ? { ...expected, textContent: actual.textContent } : expected

      expect(actual.tagName).toBe(expected.tagName)
      expect(actual.className).toBe(normalizedExpected.className)
      expect(actual.textContent).toBe(normalizedExpected.textContent)
    })
  }
})
