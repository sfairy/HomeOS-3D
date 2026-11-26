/**
 * S9f · 收尾越界：把共享样式与跨层 hook 归位到 kernel/domain。
 *
 * - 共享 UI 样式（hos-* / popup-base / utility-meter-popup / premium-accordion / screensaver-idle）
 *   属于设计系统 → kernel/ui/styles
 * - dashboard 页脚与部件可见性 hook 依赖 layout/widget 状态 → domain
 * - 系统初始化状态 → domain/system
 * - auth 场景文案（静态字符串）→ kernel/constants
 * - 摄像头传输与设备档案缓存被 studio 引用 → domain
 */
const SRC = 'homeos/frontend/src'

export default {
  moves: [
    { from: `${SRC}/app/styles/hos-icon-btn.css`, to: `${SRC}/kernel/ui/styles/hos-icon-btn.css` },
    { from: `${SRC}/app/styles/popup-base.css`, to: `${SRC}/kernel/ui/styles/popup-base.css` },
    { from: `${SRC}/app/styles/utility-meter-popup.css`, to: `${SRC}/kernel/ui/styles/utility-meter-popup.css` },
    { from: `${SRC}/app/styles/premium-accordion.css`, to: `${SRC}/kernel/ui/styles/premium-accordion.css` },
    { from: `${SRC}/app/styles/screensaver-idle.css`, to: `${SRC}/kernel/ui/styles/screensaver-idle.css` },
    { from: `${SRC}/app/styles/hos-hscroll.css`, to: `${SRC}/kernel/ui/styles/hos-hscroll.css` },
    { from: `${SRC}/app/styles/hos-panel.css`, to: `${SRC}/kernel/ui/styles/hos-panel.css` },

    { from: `${SRC}/app/shell/composables/use-dashboard-footer.ts`, to: `${SRC}/domain/layout/composables/use-dashboard-footer.ts` },
    { from: `${SRC}/app/shell/composables/use-widget-panel-visibility.ts`, to: `${SRC}/domain/widget/composables/use-widget-panel-visibility.ts` },
    { from: `${SRC}/app/router/system-init.state.ts`, to: `${SRC}/domain/system/system-init.state.ts` },
    { from: `${SRC}/features/auth/model/scene-values.ts`, to: `${SRC}/kernel/constants/scene-values.ts` },

    { from: `${SRC}/features/device/camera/composables/use-go2-rtc-mse-transport.ts`, to: `${SRC}/domain/camera/use-go2-rtc-mse-transport.ts` },
    { from: `${SRC}/features/device/camera/hls-loader.ts`, to: `${SRC}/domain/camera/hls-loader.ts` },
    { from: `${SRC}/features/device/model/device-profile-kind-cache.ts`, to: `${SRC}/domain/device/device-profile-kind-cache.ts` },
  ],
}
