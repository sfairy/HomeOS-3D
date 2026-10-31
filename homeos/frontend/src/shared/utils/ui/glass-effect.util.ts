/** 毛玻璃渲染策略：native（实时 blur）| static（伪毛玻璃）| auto（触屏/static） */
import { resolveEffectivePerformanceMode } from '@/shared/utils/perf/runtime-perf-mode.util'

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
  // 档位没变就一个属性都不写：入户页会在挂载前后各调一次，写入同样的值仍会挂一次
  // attribute mutation —— 那是多余的一次样式失效判定，正是要避免的开销。
  if (document.documentElement.dataset.glassEffect === effect) return
  document.documentElement.dataset.glassEffect = effect
}

/**
 * 首帧之前先按**设备**定一次 glass 档位（不看配置）。
 *
 * 之前写入 `<html data-glass-effect>` 的唯一时机是配置到达后的 `setupGlassEffectSync()`
 * ——那在入户页是**挂载之后**。于是手机/平板上的第一帧按「无属性 = native」渲染，
 * 真的跑了一遍 `backdrop-filter: blur()`；配置回来瞬间又翻成 `static` 实底，
 * 用户看到的就是表单整体变一次色、变一次模糊。这是入户页最刺眼的一下。
 *
 * 这里用的判定与 `resolveGlassEffect(undefined, undefined)` 完全一致（粗指针 → static），
 * 因此配置若说 `auto` 且性能档正常，后续写入的值与本函数**相同**、不会产生任何翻转；
 * 只有用户显式选了 native/static 或性能模式降档时才覆盖，那是配置意图，不是闪烁。
 */
export function primeGlassEffectDocument() {
  if (typeof document === 'undefined') return
  // 后端渲染已写过就不覆盖（保留服务端判定）。
  if (document.documentElement.dataset.glassEffect) return
  applyGlassEffectDocument(undefined, undefined)
}

/** 当前同步会话的销毁函数（重复启动时先回收旧的） */
let teardown: (() => void) | null = null

/** glass 同步所需的布局配置子集（含 glassEffect 与 performanceMode） */
type LayoutConfigForGlass = {
  glassEffect?: string
  performanceMode?: string
} | null

/** 启动全局 glass 策略同步（config + 生效性能档位） */
export function setupGlassEffectSync(getLayoutConfig: (() => LayoutConfigForGlass) | null | undefined) {
  teardown?.()
  const sync = () => {
    const layout = typeof getLayoutConfig === 'function' ? getLayoutConfig() : null
    applyGlassEffectDocument(
      layout?.glassEffect,
      resolveEffectivePerformanceMode(layout?.performanceMode),
    )
  }
  sync()
  teardown = () => {
    teardown = null
  }
  return teardown
}
