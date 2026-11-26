/**
 * v-scroll-region 指令：给 `overflow: auto` 的容器补上**只在溢出时**生效的
 * `tabindex="0"` + `role="region"` + `aria-label`。
 *
 * 背景（审计 H-I02 · axe `scrollable-region-focusable` · serious）：
 * `.list-page__panel-body`、`.power-panel__body` 这类容器内容一多就只能靠滚轮/触屏滚，
 * 纯键盘用户**没法把焦点放进去**，等于内容被吞掉。
 *
 * 为什么做成指令而不是 composable：需要补的有 4 个页面各自的模板容器，逐个绑 ref
 * 再手动补 tabindex / role / aria-label，等于把同一段逻辑抄 4 遍，
 * 而且新写的列表页不会自动带上。指令把「测溢出 → 开关属性」收在一处，
 * 模板侧只加一个 `v-scroll-region="'设备列表'"`。
 *
 * 曾经并存过一个 composable 版本（`useScrollableRegion`），用于读 `isScrollable` 做滚动提示、
 * 渐隐之类的 UI 反馈；但它全仓零消费者，已随清理删除。将来真需要读这个状态时再加，
 * 不要留着两份「测溢出」的实现。
 *
 * 用法：
 *   <div class="list-page__panel-body" v-scroll-region="'模式变更日志'">…</div>
 *   <div class="power-panel__body" v-scroll-region="{ label: '首页卡片', axis: 'both' }">…</div>
 */
import type { ObjectDirective } from 'vue'

/** 亚像素取整会让 scrollHeight 比 clientHeight 大 1px，留出容差。 */
const OVERFLOW_TOLERANCE_PX = 2

interface ScrollRegionBinding {
  /** 读屏念出的区域名，如「模式变更日志」。 */
  label: string
  /** 只判纵向（默认）还是纵横都判。横向溢出的表格需要 `'both'`。 */
  axis?: 'vertical' | 'both'
}

type ScrollRegionEl = HTMLElement & {
  /** ResizeObserver：容器自身尺寸变化（窗口缩放、侧栏折叠）。 */
  __scrollRegionResize?: ResizeObserver
  /** MutationObserver：容器尺寸不变但内容变多，ResizeObserver 对此无感。 */
  __scrollRegionMutation?: MutationObserver
  /** 当前是否已挂上可聚焦语义，避免每帧重复写 DOM。 */
  __scrollRegionActive?: boolean
}

function normalize(bindingValue: unknown): ScrollRegionBinding {
  if (typeof bindingValue === 'string') return { label: bindingValue }
  const value = bindingValue as ScrollRegionBinding | undefined
  return { label: value?.label || '可滚动区域', axis: value?.axis ?? 'vertical' }
}

/**
 * 测一次并同步属性。
 *
 * 只在**真的溢出**时挂 `tabindex`：给一个只溢出 2px、键盘用户根本不需要滚的容器常驻
 * `tabindex="0"`，只是往 Tab 序列里塞一个毫无作用的停靠点，反而拉长到主内容的路径。
 */
function sync(el: ScrollRegionEl, options: ScrollRegionBinding): void {
  const vertical = el.scrollHeight - el.clientHeight > OVERFLOW_TOLERANCE_PX
  const horizontal = options.axis === 'both' && el.scrollWidth - el.clientWidth > OVERFLOW_TOLERANCE_PX
  const overflow = vertical || horizontal
  if (overflow === Boolean(el.__scrollRegionActive)) {
    // 状态没变：只在首次或 label 变更时补写一次属性，其余情况直接返回。
    if (overflow && el.getAttribute('aria-label') !== options.label) {
      el.setAttribute('aria-label', options.label)
    }
    return
  }

  el.__scrollRegionActive = overflow
  if (overflow) {
    el.setAttribute('tabindex', '0')
    el.setAttribute('role', 'region')
    el.setAttribute('aria-label', options.label)
  } else {
    // 不溢出时必须全部撤掉：留着 `role="region"` 会凭空多出一个地标。
    el.removeAttribute('tabindex')
    el.removeAttribute('role')
    el.removeAttribute('aria-label')
  }
}

function attach(el: ScrollRegionEl, options: ScrollRegionBinding): void {
  detach(el)

  if (typeof ResizeObserver !== 'undefined') {
    el.__scrollRegionResize = new ResizeObserver(() => sync(el, options))
    el.__scrollRegionResize.observe(el)
  }
  if (typeof MutationObserver !== 'undefined') {
    // `characterData` 覆盖「同一行文本变长撑高」；子节点增删覆盖异步列表追加。
    el.__scrollRegionMutation = new MutationObserver(() => sync(el, options))
    el.__scrollRegionMutation.observe(el, { childList: true, subtree: true, characterData: true })
  }
  // 首帧内容可能还没排版完（字体、图片），下一帧再补测一次。
  requestAnimationFrame(() => sync(el, options))
}

function detach(el: ScrollRegionEl): void {
  el.__scrollRegionResize?.disconnect()
  el.__scrollRegionMutation?.disconnect()
  delete el.__scrollRegionResize
  delete el.__scrollRegionMutation
}

/**
 * 指令定义。
 *
 * - `mounted`：装观察器并测一次
 * - `updated`：label 可能随语言/页签变化，重测并刷新文案
 * - `beforeUnmount`：断开观察器（属性随节点一起消失，无需清理）
 */
export const scrollRegion: ObjectDirective<HTMLElement, string | ScrollRegionBinding> = {
  mounted(el, binding) {
    attach(el as ScrollRegionEl, normalize(binding.value))
  },
  updated(el, binding) {
    sync(el as ScrollRegionEl, normalize(binding.value))
  },
  beforeUnmount(el) {
    detach(el as ScrollRegionEl)
  },
}
