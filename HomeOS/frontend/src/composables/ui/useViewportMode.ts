/**
 * 视口模式：移动端（含横屏手机）vs 横屏大屏，互不干扰。
 * 横屏手机（短边 <600 且长边 <900）同样进入移动适配壳，
 * 避免回退桌面横屏壳后被 0.38 倍整页等比缩放裁切而不可用。
 */
import { ref } from 'vue'
import { isPhoneViewport } from '@/utils/config/viewport-breakpoints.util'

type ViewportMode = 'mobile-portrait' | 'desktop-landscape'

function detectMode(): ViewportMode {
  if (typeof window === 'undefined') return 'desktop-landscape'
  const w = window.innerWidth
  const h = window.innerHeight
  // 手机壳：手机判定（短边 <600 且长边 <900）即进入移动适配壳，含横屏手机（如 844×390），
  // 避免横屏手机回退桌面横屏壳被 0.38 倍整页等比缩放裁切；
  // 平板竖屏（短边 ≥600，如 768×1024）保持桌面横屏壳。判定口径与 useScaling 同源（viewport-breakpoints.util）。
  if (isPhoneViewport(w, h)) return 'mobile-portrait'
  return 'desktop-landscape'
}

const mode = ref<ViewportMode>(detectMode())

function refresh() {
  mode.value = detectMode()
}

let listenersAttached = false

function ensureListeners() {
  if (listenersAttached || typeof window === 'undefined') return
  listenersAttached = true
  window.addEventListener('resize', refresh, { passive: true })
  window.addEventListener('orientationchange', refresh, { passive: true })
}

/** 路由守卫等非 setup 上下文可读当前是否竖屏窄视口 */
export function isMobilePortraitViewport(): boolean {
  ensureListeners()
  refresh()
  return mode.value === 'mobile-portrait'
}

/**
 * 响应式视口模式（Composition API）。
 *
 * 返回模块级共享 Ref，随 resize / orientationchange 实时更新；
 * 组件内基于它派生 `isMobile` 时不会在 computed getter 里写入 ref（避免自我触发）。
 *
 * @returns 视口模式 Ref：'mobile-portrait' | 'desktop-landscape'
 */
export function useViewportMode() {
  ensureListeners()
  refresh()
  return mode
}

ensureListeners()
