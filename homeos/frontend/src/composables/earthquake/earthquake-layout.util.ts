/**
 * @module earthquake/earthquake
 * @description 地震预警前端开关与展示格式化工具。
 *
 * 职责：
 *  - 判断前端是否应接受 EEW（Early Earthquake Warning）告警（须 layout 已启用）；
 *  - 同步用户关闭的预警到后端；
 *  - 格式化震级展示与颜色分级。
 *
 * 依赖：@/stores/layout.store、@/services/api/earthquake、@/utils/core/logger。
 */
import { useLayoutStore } from '@/stores/layout.store'
import { dismissEarthquakeAlert } from '@/services/api/earthquake'
import { logger } from '@/utils/core/logger'

/**
 * 前端是否应接受 EEW 告警（须 layout 中已启用）。
 * @returns 是否启用地震预警
 */
export function isEarthquakeAlertEnabled(): boolean {
  const layoutStore = useLayoutStore()
  return layoutStore.layoutConfig?.earthquakeConfig?.enabled === true
}

/**
 * 将用户关闭的预警同步到后端（自动关闭与滑动解锁共用）。
 * @param eventId 地震事件 ID
 * @sideeffect 失败仅 debug 日志，不抛出
 */
export function syncEarthquakeDismiss(eventId: string | null | undefined): void {
  const id = String(eventId || '').trim()
  if (!id) return
  void dismissEarthquakeAlert(id).catch((err: unknown) => {
    logger.debug('同步地震预警 dismiss 失败', err)
  })
}

/**
 * 地震震级展示格式化。
 * @param magnitude 震级原始值
 * @returns 保留一位小数的字符串；非法值返回「—」
 */
export function formatEarthquakeMagnitude(magnitude: unknown): string {
  const n = Number(magnitude)
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(1)
}

/** 震级颜色分级标签（与 UI 语义色对应） */
type EarthquakeMagnitudeTone = 'muted' | 'sky' | 'amber' | 'orange' | 'danger'

/**
 * 根据震级返回颜色分级标签。
 *  - ≥6 danger（危险，红）
 *  - ≥5 orange（橙）
 *  - ≥4 amber（黄）
 *  - ≥3 sky（蓝）
 *  - 其他 muted（灰）
 * @param magnitude 震级原始值
 * @returns 颜色分级标签
 */
export function earthquakeMagnitudeTone(magnitude: unknown): EarthquakeMagnitudeTone {
  const n = Number(magnitude)
  if (!Number.isFinite(n)) return 'muted'
  if (n >= 6) return 'danger'
  if (n >= 5) return 'orange'
  if (n >= 4) return 'amber'
  if (n >= 3) return 'sky'
  return 'muted'
}
