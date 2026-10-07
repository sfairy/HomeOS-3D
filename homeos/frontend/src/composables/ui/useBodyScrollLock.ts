/**
 * @file body 滚动锁（引用计数） Composable
 * @module composables/ui/useBodyScrollLock
 *
 * 职责：
 *  - 给"打开即锁滚动"的浮层提供统一的加锁 / 解锁入口。
 *  - 以引用计数解决多个浮层叠加时互相踩踏的问题：确认框（VConfirmModal）之上再打开
 *    输入框（VPromptModal）或全屏查看器时，只有**最后一个**关闭者才恢复滚动，
 *    否则先关的那一层会把 `overflow` 提前还原，背后页面被误滚。
 *  - 解锁时恢复加锁前的原始值（而不是硬写 `''`），不破坏调用方自己写过的内联样式。
 *
 * 看门狗（本模块的四条防线，按「最可能踩到」排序）：
 *  1. **取锁点落在生命周期上**：`useBodyScrollLock` 不再在 setup 里同步取锁，而是等 `onMounted`。
 *     setup 里同步取锁后若后续 setup 抛错，组件不会挂载 → `onUnmounted` 不会执行 → 锁永久残留
 *     （表现为整页再也滚不动，且没有任何浮层在场）。改到挂载点取锁后，取锁与释放一定成对。
 *  2. **重复来源检测**：同一标签同时持锁多次即视为重复注册（真实踩过的 bug：
 *     VFolderCreateModal 把 `useBodyScrollLock(modalActive)` 写了两遍），触发 `console.warn`；
 *     不按 DEV 门禁屏蔽 —— 它只在 bug 真的存在时才会响，属于该被看见的信号；
 *     诊断口径见 `getBodyScrollLockState().duplicates`。
 *  3. **诊断入口**：`getBodyScrollLockState()` 直接给出「谁还持着锁」。
 *  4. **兜底解锁**：`releaseAllBodyScrollLocks()` 用于页面已经卡死的救援场景。
 *
 * 不做的：没有「按 DOM 自动判定该不该解锁」的自动愈合 —— 「该解锁」没有可靠信号
 * （上一个存活的浮层并不等于该解锁的那个），猜错的后果是把仍在显示的浮层脚下的滚动放开。
 *
 * 依赖：vue 的 onMounted / onUnmounted / watch 与 Ref 类型。
 */
import { onMounted, onUnmounted, watch, type Ref } from 'vue'

/** 当前持有锁的浮层数量；0 表示未锁。 */
let lockCount = 0
/** 首次加锁前 body 的 overflow 内联值，用于解锁时精确还原。 */
let previousOverflow = ''
/** 持有者登记：id → 来源标签。只服务于诊断，不参与加解锁判定。 */
const holders = new Map<number, string>()
/** 持有者 id 自增源，保证同一来源的多次持锁能被区分。 */
let nextHolderId = 0

/** 未命名来源的占位标签；匿名持有者不参与重复检测，避免互相误判。 */
const ANONYMOUS = '匿名浮层'

/** 滚动锁的当前状态快照（诊断用）。 */
export interface BodyScrollLockState {
  /** 当前持锁数量；>0 但界面上没有任何浮层时即为泄漏。 */
  count: number
  /** 当前持锁来源标签，按持锁顺序排列。 */
  holders: string[]
  /** 同一来源同时持锁多次的标签 —— 重复注册的直接证据。 */
  duplicates: string[]
}

/**
 * 读取滚动锁状态，用于排查「页面滚不动 / 明明没开弹窗却锁着」。
 * @returns 当前持锁数量、来源标签与重复来源
 */
export function getBodyScrollLockState(): BodyScrollLockState {
  const labels = [...holders.values()]
  return {
    count: lockCount,
    holders: labels,
    // 匿名持有者共用占位标签，按标签判重会误报，故排除（与告警门槛保持一致）。
    duplicates: [
      ...new Set(
        labels.filter((label, i) => label !== ANONYMOUS && labels.indexOf(label) !== i),
      ),
    ],
  }
}

/**
 * 兜底解锁：清空全部持有者并还原 body 滚动。
 *
 * **只用于救援**（页面已卡死、界面上无处可点时的 devtools / 测试 / 诊断入口）。
 * 正常流程不要调用：它会把仍在显示的浮层脚下的滚动一并放开。
 */
export function releaseAllBodyScrollLocks(): void {
  holders.clear()
  lockCount = 0
  document.body.style.overflow = previousOverflow
  previousOverflow = ''
}

/**
 * 手动加锁，返回幂等的解锁函数。
 *
 * 调用场景：非组件场景（事件回调、指令）需要临时锁滚动时使用；
 * 组件内优先用 `useBodyScrollLock(active, label)`，它会在卸载时自动释放。
 *
 * @param label - 来源标签，只用于诊断（重复检测 + 状态快照）
 * @returns 解锁函数，重复调用只有第一次生效
 */
export function acquireBodyScrollLock(label: string = ANONYMOUS): () => void {
  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  const id = ++nextHolderId
  holders.set(id, label)
  lockCount += 1
  if (label !== ANONYMOUS) {
    warnOnDuplicateHolder(label, id)
  }

  let released = false
  return () => {
    if (released) return
    released = true
    holders.delete(id)
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount === 0) {
      document.body.style.overflow = previousOverflow
      previousOverflow = ''
    }
  }
}

/**
 * 同一来源同时持锁多次 = 重复注册，触发 console.warn。
 *
 * 这类 bug 的隐蔽之处：页面看起来正常（多锁一层不会更"锁"），
 * 但只要有一处提前解锁，引用计数就与实际浮层数量对不上，滚动会提前恢复。
 *
 * @param label - 来源标签
 * @param currentId - 本次持锁的 id（从重复结果里排除自己）
 */
function warnOnDuplicateHolder(label: string, currentId: number): void {
  const sameLabel = [...holders.entries()].filter(
    ([id, holder]) => holder === label && id !== currentId,
  )
  if (sameLabel.length === 0) return
  console.warn(
    `[useBodyScrollLock] 同一来源重复加锁：${label}（当前 ${sameLabel.length + 1} 次）。` +
      '请检查是否重复注册了 useBodyScrollLock —— 多出来的那次解锁时机通常也不对。',
  )
}

/**
 * 把响应式开关接到 body 滚动锁上。
 *
 * @param active - 浮层是否可见（ref / computed 均可）
 * @param label - 来源标签，只用于诊断（重复检测 + 状态快照）
 * @sideEffect 挂载时按当前可见状态加锁；此后监听 active 变化；卸载时兜底释放，避免锁泄漏。
 */
export function useBodyScrollLock(
  active: Ref<boolean> | { readonly value: boolean },
  label: string = ANONYMOUS,
) {
  let release: (() => void) | null = null
  /** 是否已挂载：挂载前不取锁，理由见文件头「看门狗 1」。 */
  let mounted = false

  /** 按当前可见状态同步锁：幂等，重复加/解锁不会打乱计数。 */
  function sync(isActive: boolean) {
    if (!mounted) return
    if (isActive) {
      if (!release) release = acquireBodyScrollLock(label)
      return
    }
    if (release) {
      release()
      release = null
    }
  }

  onMounted(() => {
    mounted = true
    sync(active.value)
  })

  watch(() => active.value, sync)

  onUnmounted(() => {
    if (release) {
      release()
      release = null
    }
  })
}
