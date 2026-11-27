/**
 * S1b · 补齐 kernel 的通用 UI 设施。
 *
 * 依据：计划 §4.1「kernel/ui = 无业务语义的设计系统原语与通用控件」。
 *
 * 判别方法：逐个检查 hook 的 import 列表，只把**不依赖 stores / services / shared 域**
 * 的移到 kernel。依赖 layout/entities store 的（`useLayoutConfigRef`、`kiosk-animation`、
 * `useHaDegrade`）留给 S2 的 domain 层；依赖 notifications API 的（`useWebPushSubscribe`）
 * 留给 S3 的 features 层。
 */
export default {
  moves: [
    // 通用 DOM / 焦点 / 滚动 / 视口 / 时钟 hook（零上层依赖）
    {
      from: 'homeos/frontend/src/composables/ui/useAppTheme.ts',
      to: 'homeos/frontend/src/kernel/ui/hooks/use-app-theme.ts',
    },
    {
      from: 'homeos/frontend/src/composables/ui/useBackgroundInert.ts',
      to: 'homeos/frontend/src/kernel/ui/hooks/use-background-inert.ts',
    },
    {
      from: 'homeos/frontend/src/composables/ui/useBodyScrollLock.ts',
      to: 'homeos/frontend/src/kernel/ui/hooks/use-body-scroll-lock.ts',
    },
    {
      from: 'homeos/frontend/src/composables/ui/useCanvasMetrics.ts',
      to: 'homeos/frontend/src/kernel/ui/hooks/use-canvas-metrics.ts',
    },
    {
      from: 'homeos/frontend/src/composables/ui/useClickOutside.ts',
      to: 'homeos/frontend/src/kernel/ui/hooks/use-click-outside.ts',
    },
    {
      from: 'homeos/frontend/src/composables/ui/useEchartsHost.ts',
      to: 'homeos/frontend/src/kernel/ui/hooks/use-echarts-host.ts',
    },
    {
      from: 'homeos/frontend/src/composables/ui/useEscStack.ts',
      to: 'homeos/frontend/src/kernel/ui/hooks/use-esc-stack.ts',
    },
    {
      from: 'homeos/frontend/src/composables/ui/useFetchGeneration.ts',
      to: 'homeos/frontend/src/kernel/ui/hooks/use-fetch-generation.ts',
    },
    {
      from: 'homeos/frontend/src/composables/ui/useFocusTrap.ts',
      to: 'homeos/frontend/src/kernel/ui/hooks/use-focus-trap.ts',
    },
    {
      from: 'homeos/frontend/src/composables/ui/useHorizontalScrollNav.ts',
      to: 'homeos/frontend/src/kernel/ui/hooks/use-horizontal-scroll-nav.ts',
    },
    {
      from: 'homeos/frontend/src/composables/ui/useKeepAliveGate.ts',
      to: 'homeos/frontend/src/kernel/ui/hooks/use-keep-alive-gate.ts',
    },
    {
      from: 'homeos/frontend/src/composables/ui/usePerfClock.ts',
      to: 'homeos/frontend/src/kernel/ui/hooks/use-perf-clock.ts',
    },
    {
      from: 'homeos/frontend/src/composables/ui/useScaling.ts',
      to: 'homeos/frontend/src/kernel/ui/hooks/use-scaling.ts',
    },
    {
      from: 'homeos/frontend/src/composables/ui/useSwiperDraggable.ts',
      to: 'homeos/frontend/src/kernel/ui/hooks/use-swiper-draggable.ts',
    },
    {
      from: 'homeos/frontend/src/composables/ui/usePopupHistoryGuard.ts',
      to: 'homeos/frontend/src/kernel/ui/hooks/use-popup-history-guard.ts',
    },
    {
      from: 'homeos/frontend/src/composables/ui/useLandscapePrompt.ts',
      to: 'homeos/frontend/src/kernel/ui/hooks/use-landscape-prompt.ts',
    },
    {
      from: 'homeos/frontend/src/composables/ui/hub-viewport.internals.ts',
      to: 'homeos/frontend/src/kernel/ui/hooks/hub-viewport.ts',
    },
  ],
  dirMoves: [
    // 弹窗定位族（纯几何 / DOM）
    { from: 'homeos/frontend/src/composables/ui/popup', to: 'homeos/frontend/src/kernel/ui/popup' },
  ],
  // chrome 状态是「Toast 队列 / 全局对话框开关」，无业务数据，属 L0。
  // 移到 kernel 后，kernel/ui 下的 VConfirmModal / VNotification / VPromptModal 才不越界。
  merges: [
    {
      into: 'homeos/frontend/src/kernel/ui/chrome/chrome-store.ts',
      from: ['homeos/frontend/src/stores/ui/create-chrome-state.ts', 'homeos/frontend/src/stores/chrome.store.ts'],
      header:
        '/**\n * UI 表层状态（Toast 队列 / 确认与输入对话框 / 全局弹窗开关）。\n *\n * 为什么在 kernel：这份状态不含任何业务数据，是设计系统的组成部分；\n * 放在 stores/ 会让 kernel/ui 的原语被迫向上依赖，破坏 L0 边界。\n */',
    },
  ],
}
