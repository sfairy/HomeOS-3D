/**
 * @file useTeleportTargetGuard.ts
 * @module composables/ui
 * @description 路由切换时清理 keep-alive / body Teleport 残留遮罩的守卫 composable。
 *
 * 依赖：
 * - vue（nextTick/watch）
 * - vue-router（useRoute 获取当前路由）
 */
import { nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'

/** 约定：带此 class 或 data-hos-overlay="scrub" 的层在路由切换时可安全移除 */
const OVERLAY_SCRUB_ATTR = '[data-hos-overlay="scrub"]'
const OVERLAY_SCRUB_CLASS = '.hos-overlay-scrub'

/** #teleport-target 的直接子节点中，可安全清掉的残留遮罩 */
const SHELL_CHILD_SELECTOR = [
  OVERLAY_SCRUB_CLASS,
  OVERLAY_SCRUB_ATTR,
  '.linkage-builder-drawer-overlay',
  '.wr-modal-shade',
  '.saw-overlay',
  '.hos-modal-root',
  '.hos-modal-backdrop',
].join(',')

/** 挂到 body 上、离开页面后仍可能挡住其它 Tab 的层 */
const BODY_OVERLAY_SELECTOR = [
  OVERLAY_SCRUB_CLASS,
  OVERLAY_SCRUB_ATTR,
  '.settings-popout-backdrop-layer',
  '.settings-popout-menu-panel',
  '.saw-overlay',
].join(',')

/**
 * 路由切换时清掉 keep-alive / body Teleport 残留遮罩，
 * 避免挡住生活与联动中心的 Tab 点击。
 * 保留 #teleport-target 内的 .entity-control-backdrop（全局实体控制）。
 *
 * 调用场景：主布局组件初始化时调用，自动监听路由变化并执行清理。
 */
export function useTeleportTargetGuard() {
  const route = useRoute()
  let timers: ReturnType<typeof setTimeout>[] = []

  /** 执行清理：移除 teleport-target 下的残留遮罩（保留 entity-control-backdrop）与 body 上的设置浮层 */
  function scrub() {
    if (typeof document === 'undefined') return
    const root = document.getElementById('teleport-target')
    if (root) {
      for (const node of [...root.children]) {
        if (!(node instanceof Element)) continue
        // 保留全局实体控制遮罩，其余命中选择器的残留节点移除
        if (node.classList.contains('entity-control-backdrop')) continue
        if (node.matches(SHELL_CHILD_SELECTOR)) node.remove()
      }
    }
    // 清理 body 上设置页的浮层与遮罩
    for (const node of document.body.querySelectorAll(BODY_OVERLAY_SELECTOR)) {
      node.remove()
    }
  }

  /** 延迟清理：立即清一次 + nextTick 清一次 + 50ms/360ms 各清一次以覆盖 leave 动画 */
  function scrubSoon() {
    for (const t of timers) clearTimeout(t)
    timers = []
    scrub()
    void nextTick(scrub)
    // leave 动画可能拖到 300ms+，延迟再清一次
    timers.push(setTimeout(scrub, 50), setTimeout(scrub, 360))
  }

  // 路由 fullPath 变化时触发延迟清理
  watch(
    () => route.fullPath,
    () => scrubSoon(),
  )
}