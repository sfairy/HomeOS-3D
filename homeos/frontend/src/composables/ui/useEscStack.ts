/** 解决的故障：浮层各自在 `window` 上加 keydown 监听，一次 Esc 会被**所有**在场浮层收到。 */
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
function pushEscLayer(label: string, handler: (event: KeyboardEvent) => void): () => void {
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
