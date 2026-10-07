/**
 * @file 全局 Esc 层级栈（只关最上层）
 * @module composables/ui/useEscStack
 *
 * 解决的故障：浮层各自在 `window` 上加 keydown 监听，一次 Esc 会被**所有**在场浮层收到。
 * 结果是「全屏查看器 + 全局确认框同时在场上时，按一次 Esc 两层一起关」。
 * 注意 `stopPropagation()` 挡不住这种叠加：同一目标（window）上的多个监听器只受
 * `stopImmediatePropagation` 影响，而那又取决于注册顺序，不可依赖。
 *
 * 做法：把「谁响应 Esc」收敛成一个栈 ——
 *  - 浮层在自己可见时压栈（`useEscLayer`），不可见时出栈，卸载时兜底出栈；
 *  - 全模块只挂一个 `window` keydown 监听，只把事件派发给**栈顶**那一层。
 *
 * 两条约定，缺一不可：
 *  1. **压栈顺序即视觉叠放顺序**：后打开的浮层后压栈 → 位于栈顶。浮层按打开顺序叠放时成立；
 *     若某处出现「后打开的反而在下面」，那一层就不该用压栈顺序表达，需要显式指定层级。
 *  2. **已被处理的事件不重复处理**：监听器遇到 `event.defaultPrevented === true` 直接返回。
 *     这条让**不**入栈的处理器天然拥有更高优先级 —— 典型是下拉框：Vue 的
 *     `@keydown.escape.prevent` 会先 `preventDefault()`，于是「下拉里的 Esc 只关下拉，
 *     不会顺带把装着它的弹窗也关掉」，这些组件一行都不用改。
 *
 * 未入栈的处理器仍然可能抢事件（它自己不 `preventDefault` / `stopPropagation`），
 * 因此「只关最上层」的成立范围 = 所有 window 级 Esc 处理器都已入栈或会 preventDefault。
 *
 * 依赖：vue 的 watch / onUnmounted 与 Ref 类型。
 */
import { onUnmounted, watch, type Ref } from 'vue'

/** 栈中的一层浮层。 */
interface EscLayer {
  /** 唯一 id，用于出栈时精确删除（不必是栈顶）。 */
  id: number
  /** 来源标签，仅用于诊断。 */
  label: string
  /** Esc 处理器；必须在 setup 内定义且保持稳定（栈里存的是引用）。 */
  handler: (event: KeyboardEvent) => void
}

/** 层级栈：末尾为栈顶（最后打开、视觉最上层）。 */
const layers: EscLayer[] = []
/** 层 id 自增源。 */
let nextId = 0
/** 是否已挂载全局监听（栈空时不挂，避免常驻监听）。 */
let listening = false

/**
 * 唯一的全局 Esc 处理：只派发给栈顶。
 * @param event 键盘事件
 */
function onEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  const top = layers[layers.length - 1]
  if (!top) return
  // 先拦掉默认行为，再派发：避免原生 <dialog> 之类的默认关闭动作重复执行一遍。
  event.preventDefault()
  top.handler(event)
}

/** 栈空时摘掉全局监听，非空（首次压栈）时挂上。 */
function syncListener() {
  if (layers.length > 0 && !listening) {
    window.addEventListener('keydown', onEscape)
    listening = true
    return
  }
  if (layers.length === 0 && listening) {
    window.removeEventListener('keydown', onEscape)
    listening = false
  }
}

/**
 * 手动压栈，返回幂等的出栈函数。
 *
 * 调用场景：非组件场景（指令、一次性浮层）需要参与 Esc 层级时使用；
 * 组件内优先用 `useEscLayer(active, label, handler)`，它会在不可见/卸载时自动出栈。
 *
 * @param label - 来源标签，仅用于诊断
 * @param handler - Esc 处理器
 * @returns 出栈函数，重复调用只有第一次生效
 */
export function pushEscLayer(label: string, handler: (event: KeyboardEvent) => void): () => void {
  const layer: EscLayer = { id: ++nextId, label, handler }
  layers.push(layer)
  syncListener()

  let popped = false
  return () => {
    if (popped) return
    popped = true
    const index = layers.indexOf(layer)
    if (index !== -1) layers.splice(index, 1)
    syncListener()
  }
}

/**
 * 当前层级栈快照（自底向顶），用于排查「谁吃掉了 Esc」。
 * @returns 各层来源标签，末尾为当前栈顶
 */
export function getEscStackLabels(): string[] {
  return layers.map((layer) => layer.label)
}

/**
 * 把浮层的「是否可见」接到 Esc 层级栈上。
 *
 * 可见即压栈、不可见即出栈；组件卸载兜底出栈。压栈顺序 = 打开顺序 = 视觉叠放顺序，
 * 因此栈顶就是用户眼中最上层的那一层，Esc 只会关掉它。
 *
 * @param active - 浮层是否可见（ref / computed 均可）
 * @param label - 来源标签，仅用于诊断
 * @param handler - Esc 处理器；请在 setup 内定义并保持稳定（栈内存的是引用）
 * @sideEffect 可见时向全局 Esc 栈压入一层
 */
export function useEscLayer(
  active: Ref<boolean> | { readonly value: boolean },
  label: string,
  handler: (event: KeyboardEvent) => void,
) {
  let pop: (() => void) | null = null

  /** 按当前可见状态同步栈：幂等，重复压/出栈不会打乱顺序。 */
  function sync(isActive: boolean) {
    if (isActive) {
      if (!pop) pop = pushEscLayer(label, handler)
      return
    }
    if (pop) {
      pop()
      pop = null
    }
  }

  watch(() => active.value, sync, { immediate: true })

  onUnmounted(() => {
    if (pop) {
      pop()
      pop = null
    }
  })
}
