
/**
 * 模态层背景隔离（useBackgroundInert）回归。
 *
 * 守护的故障：只做焦点陷阱的弹窗，在无障碍树里仍是「弹窗 + 一整个还能用的背景」——
 * 读屏虚拟光标念得到后面的按钮，`inert` 缺失时指针 / 自动化也能穿透。这些都不需要
 * 真浏览器就能测：被守护的是**遍历口径**（隔哪几个兄弟节点）与**还原口径**
 * （引用计数 + 原值），DOM 只是这两个口径的输入。
 *
 * 这里用替身树而不是 jsdom：本仓库前端冒烟一律零依赖（见 `_smoke_harness.ts`），
 * 而这两个口径只用到 `parentElement` / `children` / `inert` / `aria-hidden` 四面。
 *
 * 用法：``bun run scripts/smoke/_background_inert_smoke.ts``（在 homeos/frontend 下执行）。
 */

import { check, report, section } from '../_smoke_harness'

import {
  backgroundInertTargets,
  getBackgroundInertLabels,
  markBackgroundInert,
  unmarkBackgroundInert,
} from '@/composables/ui/useBackgroundInert'

/* ------------------------------------------------------------------ *
 * 替身元素：只实现被守护逻辑真正用到的面
 * ------------------------------------------------------------------ */

class FakeElement {
  nodeType = 1
  children: FakeElement[] = []
  parentElement: FakeElement | null = null
  /** 与真实 DOM 一致：读得到布尔属性，赋值即设属性。 */
  inert = false
  ownerDocument: { body: FakeElement } | null = null
  private attrs = new Map<string, string>()

  constructor(public tag = 'div') {}

  append(child: FakeElement): FakeElement {
    child.parentElement = this
    this.children.push(child)
    return child
  }

  getAttribute(name: string): string | null {
    return this.attrs.has(name) ? this.attrs.get(name)! : null
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, String(value))
  }

  removeAttribute(name: string): void {
    this.attrs.delete(name)
  }
}

/**
 * 造一棵与线上结构同形的树：
 *
 * ```
 * body
 * ├── #app
 * │   ├── .page         ← 应用内容（应当被隔离）
 * │   └── #teleport-target
 * │       └── .modal-root ← 浮层根（不该被隔离）
 * └── .toast-layer      ← body 级兄弟（应当被隔离）
 * ```
 */
function scene() {
  const body = new FakeElement('body')
  const app = body.append(new FakeElement('div'))
  const page = app.append(new FakeElement('main'))
  const teleportTarget = app.append(new FakeElement('div'))
  const modalRoot = teleportTarget.append(new FakeElement('div'))
  const toastLayer = body.append(new FakeElement('div'))
  for (const element of [body, app, page, teleportTarget, modalRoot, toastLayer]) {
    element.ownerDocument = { body }
  }
  return { body, app, page, teleportTarget, modalRoot, toastLayer }
}

const asFake = (element: unknown) => element as FakeElement

/* ------------------------------------------------------------------ *
 * 1. 遍历口径：只隔离兄弟节点
 * ------------------------------------------------------------------ */

section('1. 遍历口径')

{
  const { page, teleportTarget, modalRoot, toastLayer } = scene()
  const targets = backgroundInertTargets(asFake(modalRoot))

  check(
    '隔离 .page 与 .toast-layer（逐级兄弟）',
    targets.length === 2 && targets[0] === (page as unknown) && targets[1] === (toastLayer as unknown),
    targets.map((item) => asFake(item).tag),
  )
  check('不隔离浮层自己', !targets.includes(modalRoot as unknown as HTMLElement), '')
  check('不隔离浮层的挂载点 #teleport-target', !targets.includes(teleportTarget as unknown as HTMLElement), '')
  check('不隔离浮层根节点自身', !targets.includes(asFake(teleportTarget) as unknown as HTMLElement), '')
}

/* ------------------------------------------------------------------ *
 * 2. 隔离与还原
 * ------------------------------------------------------------------ */

section('2. 隔离与还原')

{
  const { page, modalRoot, toastLayer } = scene()
  const targets = backgroundInertTargets(asFake(modalRoot))

  markBackgroundInert(targets, '素材管理器')
  check('隔离后 .page 为 inert', asFake(page).inert === true, asFake(page).inert)
  check('隔离后 .page 有 aria-hidden', asFake(page).getAttribute('aria-hidden') === 'true', '')
  check('隔离后 .toast-layer 为 inert', asFake(toastLayer).inert === true, asFake(toastLayer).inert)
  check('诊断栈记录来源标签', getBackgroundInertLabels().join(',') === '素材管理器', getBackgroundInertLabels())

  unmarkBackgroundInert(targets, '素材管理器')
  check('还原后 .page 不再是 inert', asFake(page).inert === false, asFake(page).inert)
  check('还原后 .page 摘掉 aria-hidden', asFake(page).getAttribute('aria-hidden') === null, '')
  check('诊断栈已清空', getBackgroundInertLabels().length === 0, getBackgroundInertLabels())
}

{
  // `aria-hidden="false"` / 本来就是 inert：还原必须回到原值，而不是一律删掉 / 置 false。
  const { page, modalRoot } = scene()
  asFake(page).setAttribute('aria-hidden', 'false')
  asFake(page).inert = true
  const targets = backgroundInertTargets(asFake(modalRoot))

  markBackgroundInert(targets, '原值保真')
  unmarkBackgroundInert(targets, '原值保真')
  check('还原回原有的 aria-hidden="false"', asFake(page).getAttribute('aria-hidden') === 'false', asFake(page).getAttribute('aria-hidden'))
  check('还原回本来就有的 inert', asFake(page).inert === true, asFake(page).inert)
}

/* ------------------------------------------------------------------ *
 * 3. 叠层引用计数
 * ------------------------------------------------------------------ */

section('3. 叠层引用计数')

{
  // 场景：素材管理器里又开了素材选择器，两层都会把对方的兄弟标成 inert。
  const { page, modalRoot } = scene()
  const first = backgroundInertTargets(asFake(modalRoot))
  const second = backgroundInertTargets(asFake(modalRoot))

  markBackgroundInert(first, '素材管理器')
  markBackgroundInert(second, '素材选择器')
  check('两层同时隔离时标签都在', getBackgroundInertLabels().join(',') === '素材管理器,素材选择器', getBackgroundInertLabels())

  unmarkBackgroundInert(first, '素材管理器')
  check('先关一层后背景仍隔离（计数未归零）', asFake(page).inert === true, asFake(page).inert)
  check('先关一层后只剩另一层的标签', getBackgroundInertLabels().join(',') === '素材选择器', getBackgroundInertLabels())

  unmarkBackgroundInert(second, '素材选择器')
  check('两层都关后背景解除隔离', asFake(page).inert === false, asFake(page).inert)
}

/* ------------------------------------------------------------------ *
 * 4. 边界：无目标、重复还原
 * ------------------------------------------------------------------ */

section('4. 边界')

{
  // 祖先链上完全没有兄弟节点（单页壳）：不该凭空造出目标。
  const body = new FakeElement('body')
  const app = body.append(new FakeElement('div'))
  const onlyChild = app.append(new FakeElement('div'))
  for (const element of [body, app, onlyChild]) element.ownerDocument = { body }
  const { modalRoot } = scene()
  check('无兄弟可隔离时返回空表', backgroundInertTargets(asFake(onlyChild)).length === 0, '')

  const empty: HTMLElement[] = []
  markBackgroundInert(empty, '空层')
  check('空目标不登记标签', getBackgroundInertLabels().length === 0, getBackgroundInertLabels())

  const targets = backgroundInertTargets(asFake(modalRoot))
  unmarkBackgroundInert(targets, '未隔离过')
  check('重复还原不抛错且不动标签', getBackgroundInertLabels().length === 0, getBackgroundInertLabels())
}

report('模态层背景隔离回归')
