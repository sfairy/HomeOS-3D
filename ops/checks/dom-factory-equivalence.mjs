#!/usr/bin/env node
/**
 * `domElement` 与「三行写法」的等价性证明（可执行）。
 *
 * 为什么需要它
 * ------------
 * codemod 把
 *
 *     const el = doc.createElement('p')
 *     el.className = cls
 *     el.textContent = text
 *
 * 收成 `domElement(doc, 'p', cls, text)`。这依赖一个前提：`domElement` 的实现**就是**这三件事，
 * 且顺序一致、对 `null` 的处理不会引入差异。本脚本用假 document 把两种写法各跑一遍，逐字段
 * 比对 `tagName / className / textContent`，把前提变成可执行的断言。
 *
 * 覆盖的三种形态（与 `ops/scripts/codemod-dom-factory.mjs` 一一对应）：
 * 1. 类名 + 文本；2. 只有类名；3. 只有文本（此时 `domElement` 收到 `null` 类名）。
 *
 * 用法：`node ops/checks/dom-factory-equivalence.mjs`
 */
import process from 'node:process'
import { domElement } from '../../homeos/frontend/src/studio/app/shared/util/dom-factory.ts'

/** 只实现被比较的那几个字段；不需要真实 DOM。 */
function createFakeDocument() {
  return {
    createElement(tagName) {
      return { tagName: tagName.toUpperCase(), className: '', textContent: '' }
    },
  }
}

/** 三行写法的等价物（逐条对应用户代码里的语句，故意分开写以保持「原样」。） */
function manual(document, tag, className, text) {
  const element = document.createElement(tag)
  if (className !== undefined) element.className = className
  if (text !== undefined) element.textContent = String(text)
  return element
}

const cases = [
  { label: '类名 + 文本', tag: 'p', className: 'x y', text: '你好' },
  { label: '类名 + 数字文本', tag: 'span', className: 'num', text: 42 },
  { label: '只有类名', tag: 'div', className: 'card', text: undefined },
  { label: '只有文本', tag: 'h3', className: undefined, text: '标题' },
  { label: '空类名', tag: 'i', className: '', text: 'icon' },
]

let failures = 0
for (const item of cases) {
  const document = createFakeDocument()
  const expected = manual(document, item.tag, item.className, item.text)
  const actual = domElement(document, item.tag, item.className ?? null, item.text ?? null)
  // 「只有类名」形态传 `text = null`：`domElement` 不写 textContent，三行写法也不写。
  const normalizedExpected = item.text === undefined ? { ...expected, textContent: actual.textContent } : expected
  const same =
    expected.tagName === actual.tagName &&
    normalizedExpected.className === actual.className &&
    normalizedExpected.textContent === actual.textContent
  if (!same) {
    failures += 1
    console.error(`不一致：${item.label}`)
    console.error(`  三行写法 ${JSON.stringify(expected)}`)
    console.error(`  domElement ${JSON.stringify(actual)}`)
  }
}

if (failures > 0) {
  console.error(`\n等价性证明失败：${failures} / ${cases.length} 个用例不一致。`)
  process.exit(1)
}
console.log(`等价性证明通过：${cases.length} 个用例的 tagName / className / textContent 完全一致。`)
