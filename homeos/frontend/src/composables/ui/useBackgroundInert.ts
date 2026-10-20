/**
 * 模态层打开时的背景隔离：把浮层之外的那棵树整体 `inert` + `aria-hidden`。
 *
 * 为什么需要它：焦点陷阱只管 Tab 在**浮层内**循环，管不住另外两条路 ——
 * 屏幕阅读器的虚拟光标仍会念到背景（读屏用户以为弹窗后面那堆按钮还能按），
 * 以及 `inert` 缺失时浏览器仍把背景元素算作可交互（指针 / 自动化都能穿透）。
 * 只加焦点陷阱的浮层，在无障碍树里仍然是「弹窗 + 一整个还能用的背景」。
 *
 * 做法是从浮层根节点**逐级向上走到 `body`，把每一级的兄弟节点**全部隔离。
 * 选这个做法而不是「给应用根加 inert」的原因：这个仓库的浮层多数 `Teleport` 到
 * `#teleport-target`（在缩放壳内部）或 `body`，两种落点都会出现；从浮层自身
 * 向上走一步，两种落点都对，也不需要知道应用根是谁。逐级标出来的兄弟节点之间
 * 互不包含（第 k 级标的是「路径节点的叔伯」，与第 k+1 级标的没有嵌套关系），
 * 所以不会出现「同一棵子树被标两次」。
 *
 * 三个实现细节值得记：
 *
 * 1. **引用计数**：`AssetManagerModal` 里还嵌着 `AssetPickerModal` 这类叠层，
 *    两层都会把对方之外的兄弟标成 inert。没有计数，先关的那层会把后关那层
 *    仍然需要的隔离一起摘掉（背景又能动了）。
 * 2. **精确还原**：`aria-hidden` 可能是 `"false"` 这种「本来就写了」的值，
 *    `inert` 也可能是 studio 那边自己设的；还原时必须回到原值而不是一律删掉。
 * 3. **`flush: 'sync'`**：`useFocusTrap` 停用时会把焦点还原到打开前的元素，而这个元素
 *    多半就在被隔离的背景里 —— 若先还原焦点、后摘 `inert`，`focus()` 落在 inert
 *    元素上会被浏览器忽略（焦点丢失）。同步 flush 让「摘隔离」必然发生在同一批
 *    watcher（含 useFocusTrap 的）之前，与两者的注册顺序无关。
 */

import { nextTick, onUnmounted, watch, type Ref } from 'vue'

/** 每个被隔离元素的原始状态：计数 + 原 `inert` / `aria-hidden`，用于精确还原。 */
interface InertRecord {
  /** 当前有几层浮层要求隔离它。 */
  count: number
  /** 隔离前是否本就是 inert。 */
  inert: boolean
  /** 隔离前的 `aria-hidden` 原值；`null` 表示本来就没有这个属性。 */
  ariaHidden: string | null
}

/** 全模块共用一份登记表：同一元素被多层浮层隔离时按引用计数还原。 */
const records = new WeakMap<HTMLElement, InertRecord>()

/** 活跃层的标签登记（只服务诊断，不参与隔离判定）。 */
const activeLabels: string[] = []

/**
 * 当前活跃的隔离层标签（自底向顶）。
 *
 * 与 `getEscStackLabels()` / `getBodyScrollLockState()` 同属一套诊断口子：出现
 * 「浮层关掉了但背景点不动」时，先看这里有没有该摘却没摘的层。
 *
 * @returns 各层标签，末尾为最近压入的那层
 */
export function getBackgroundInertLabels(): string[] {
  return [...activeLabels]
}

/**
 * 从浮层根节点逐级走到 `body`，收集每一级的兄弟元素。
 *
 * @param root - 浮层最外层节点（必须已经在 DOM 里）
 * @returns 需要隔离的元素（不含浮层自己，也不含路径上的各级节点）
 */
function backgroundInertTargets(root: HTMLElement): HTMLElement[] {
  const targets: HTMLElement[] = []
  const body = root.ownerDocument?.body ?? null
  let node: HTMLElement | null = root
  while (node && node !== body && node.parentElement) {
    const parent: HTMLElement = node.parentElement
    for (const child of [...parent.children]) {
      // `children` 里可能有 SVG 这类非 HTMLElement：对它们只设 `aria-hidden` 也够
      // （`inert` 属性会被忽略，赋值落成普通属性，无害）。
      if (child !== node) targets.push(child as HTMLElement)
    }
    node = parent
  }
  return targets
}

/**
 * 隔离一组元素（引用计数 +1；首次隔离时记下原值）。
 *
 * @param targets - {@link backgroundInertTargets} 的返回值
 * @param label - 来源标签，仅用于 {@link getBackgroundInertLabels} 诊断
 */
function markBackgroundInert(targets: HTMLElement[], label: string = '匿名浮层'): void {
  if (targets.length === 0) return
  for (const target of targets) {
    const existing = records.get(target)
    if (existing) {
      existing.count += 1
      continue
    }
    records.set(target, {
      count: 1,
      inert: target.inert,
      ariaHidden: target.getAttribute('aria-hidden'),
    })
    target.inert = true
    target.setAttribute('aria-hidden', 'true')
  }
  activeLabels.push(label)
}

/**
 * 还原一组元素（引用计数 -1；归零时按原值还原）。
 *
 * @param targets - 与 {@link markBackgroundInert} 传入的同一组元素
 * @param label - 与压入时相同的来源标签（用于摘掉诊断登记）
 */
function unmarkBackgroundInert(targets: HTMLElement[], label: string = '匿名浮层'): void {
  if (targets.length > 0) {
    for (const target of targets) {
      const record = records.get(target)
      if (!record) continue
      record.count -= 1
      if (record.count > 0) continue
      records.delete(target)
      target.inert = record.inert
      if (record.ariaHidden === null) target.removeAttribute('aria-hidden')
      else target.setAttribute('aria-hidden', record.ariaHidden)
    }
  }
  const index = activeLabels.lastIndexOf(label)
  if (index !== -1) activeLabels.splice(index, 1)
}

/**
 * 把「浮层是否可见」接到背景隔离上：可见即隔离、不可见即还原、卸载兜底还原。
 *
 * @param rootRef - 浮层最外层节点（被 `v-if` 控制的那个元素的 ref）
 * @param active - 浮层是否可见（ref / computed 均可）
 * @param label - 来源标签，仅用于诊断
 * @sideEffect 修改浮层之外那棵树的 `inert` 与 `aria-hidden`
 */
export function useBackgroundInert(
  rootRef: Ref<HTMLElement | null>,
  active: Ref<boolean> | { readonly value: boolean },
  label: string,
): void {
  /** 本层浮层当前隔离的元素；还原时要用同一份引用。 */
  let marked: HTMLElement[] = []

  function isolate() {
    if (marked.length > 0) return
    const root = rootRef.value
    // `v-if` 的元素要等渲染落地才拿得到；拿不到就什么都不做（宁可没隔离也别报错）。
    if (!root) return
    marked = backgroundInertTargets(root)
    markBackgroundInert(marked, label)
  }

  function release() {
    if (marked.length === 0) return
    unmarkBackgroundInert(marked, label)
    marked = []
  }

  watch(
    () => active.value,
    (isActive) => {
      if (!isActive) {
        release()
        return
      }
      void nextTick(isolate)
    },
    // `sync`：见文件头第 3 条（必须在 useFocusTrap 还原焦点之前摘掉隔离）。
    { immediate: true, flush: 'sync' },
  )

  onUnmounted(release)
}
