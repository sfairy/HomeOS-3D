/**
 * 毛玻璃渲染策略：native（实时 blur）| static（伪毛玻璃）| auto（触屏/static）
 *
 * 职责：
 * - 综合配置项 override 与性能模式 performanceMode 决定最终 glass 策略
 * - 写入 documentElement 的 data-glass-effect，供 CSS 选择器切换实现
 * - 启动全局 glass 策略同步并返回销毁函数
 */

/**
 * 检测当前环境是否为粗指针（触屏设备）。触屏通常不具备实时 blur 性能。
 * @returns 触屏返回 true
 */
function isCoarsePointer() {
  if (typeof matchMedia !== 'function') return false
  return matchMedia('(pointer: coarse)').matches
}

/**
 * @param {string} [override] layoutConfig.glassEffect
 * @param {string} [performanceMode]
 * @returns {'native'|'static'}
 */
function resolveGlassEffect(
  override: string | null | undefined,
  performanceMode: string | null | undefined,
): 'native' | 'static' {
  const mode = override || 'auto'
  if (mode === 'native') return 'native'
  if (mode === 'static') return 'static'
  if (performanceMode === 'low' || performanceMode === 'medium') return 'static'
  if (isCoarsePointer()) return 'static'
  return 'native'
}

/** 写入 documentElement data-glass-effect */
export function applyGlassEffectDocument(
  override: string | null | undefined,
  performanceMode: string | null | undefined,
) {
  if (typeof document === 'undefined') return
  const effect = resolveGlassEffect(override, performanceMode)
  document.documentElement.dataset.glassEffect = effect
}

/** 当前同步会话的销毁函数（重复启动时先回收旧的） */
let teardown: (() => void) | null = null

/** glass 同步所需的布局配置子集（含 glassEffect 与 performanceMode） */
type LayoutConfigForGlass = {
  glassEffect?: string
  performanceMode?: string
} | null

/** 启动全局 glass 策略同步（config + layout performanceMode） */
export function setupGlassEffectSync(getLayoutConfig: (() => LayoutConfigForGlass) | null | undefined) {
  teardown?.()
  const sync = () => {
    const layout = typeof getLayoutConfig === 'function' ? getLayoutConfig() : null
    applyGlassEffectDocument(layout?.glassEffect, layout?.performanceMode)
  }
  sync()
  teardown = () => {
    teardown = null
  }
  return teardown
}
