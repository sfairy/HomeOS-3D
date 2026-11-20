/**
 * 隐藏控件的运行暂停（0.8.7：隐藏的仪表盘控件和分组暂停运行，重新显示时自动恢复）。
 *
 * 为什么值得单独做：仪表盘上「隐藏」通常只是把容器 `display:none`，但控件自己并不知道 ——
 * 每次状态推送仍然会重建一遍 DOM（折线图还会重画整条路径）。一个藏着十几张图表的页面
 * 在后台持续刷新，是整个面板掉帧的主要来源之一。
 *
 * 判据（按代价从低到高，命中即暂停）：
 * 1. 已卸载（`isConnected === false`）；
 * 2. 没有布局盒（`getClientRects().length === 0`：`display:none` 或零尺寸）；
 * 3. 计算样式是 `display:none` / `visibility:hidden`（覆盖 `content-visibility` 之类不产生盒子的写法）。
 *
 * 恢复用 `IntersectionObserver`：隐藏容器被重新显示时浏览器会自动补一次回调，
 * 不需要轮询，也不需要在业务代码里手动调用「恢复了」。
 *
 * **编辑态一律不暂停**：编辑器里隐藏的控件仍然要能被选中、能在属性面板里显示数据。
 */

type ResumeCallback = () => void

type PauseState = {
  observer: IntersectionObserver | null
  pending: Map<string, ResumeCallback>
  hosts: Map<string, HTMLElement>
}

const stateByOwner = new WeakMap<object, PauseState>()

function stateFor(owner: object): PauseState {
  const existing = stateByOwner.get(owner)
  if (existing) return existing
  const created: PauseState = { observer: null, pending: new Map(), hosts: new Map() }
  stateByOwner.set(owner, created)
  return created
}

/** 元素当前是否「不可见」到可以暂停。 */
export function hostIsHidden(host: HTMLElement | null | undefined): boolean {
  if (!host || !host.isConnected) return true
  if (host.getClientRects().length === 0) return true
  const view = host.ownerDocument?.defaultView
  if (!view) return false
  const style = view.getComputedStyle(host)
  return style.display === 'none' || style.visibility === 'hidden'
}

/**
 * 记下「这个控件暂停了、恢复时要重新渲染一次」。
 *
 * 同一控件重复标记只保留最后一次回调：恢复只需要跑最新的一次，
 * 把期间所有状态变化合并成一次重绘 —— 这正是暂停想要的效果。
 */
export function deferComponentRefresh(
  owner: object,
  componentId: string,
  host: HTMLElement,
  resume: ResumeCallback,
): void {
  const state = stateFor(owner)
  state.pending.set(componentId, resume)
  if (state.hosts.get(componentId) === host) return
  state.hosts.set(componentId, host)
  state.observer ??= createObserver(state)
  state.observer?.observe(host)
}

function createObserver(state: PauseState): IntersectionObserver | null {
  if (typeof IntersectionObserver !== 'function') return null
  return new IntersectionObserver((observedEntries) => {
    for (const entry of observedEntries) {
      if (!entry.isIntersecting) continue
      // 只处理「重新出现」的：一直在视野内的元素不需要额外动作（它们的刷新本来就会执行）。
      for (const [componentId, host] of state.hosts) {
        if (host !== entry.target) continue
        state.hosts.delete(componentId)
        state.observer?.unobserve(host)
        const resume = state.pending.get(componentId)
        state.pending.delete(componentId)
        resume?.()
      }
    }
  })
}

/** 控件被卸载 / 重新挂载时清掉它的观察与待刷新回调。 */
export function forgetComponentRefresh(owner: object, componentId: string): void {
  const state = stateByOwner.get(owner)
  if (!state) return
  const host = state.hosts.get(componentId)
  if (host) state.observer?.unobserve(host)
  state.hosts.delete(componentId)
  state.pending.delete(componentId)
}

/** 销毁渲染器时清空：观察器本身不持有 DOM，但待刷新回调会闭包住整棵组件树。 */
export function resetComponentVisibilityPause(owner: object): void {
  const state = stateByOwner.get(owner)
  if (!state) return
  state.observer?.disconnect()
  state.pending.clear()
  state.hosts.clear()
  stateByOwner.delete(owner)
}
