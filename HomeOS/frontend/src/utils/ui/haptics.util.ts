/**
 * 触觉反馈（震动）工具。
 *
 * 职责：
 * - 综合系统偏好（减少动效）与本地开关判断是否启用震动
 * - 提供告警/安防场景的震动反馈 helper
 *
 * 说明：仅在支持 navigator.vibrate 的环境生效；偏好或开关关闭时静默跳过。
 */

/** localStorage 中震动开关的存储键（'0' / 'false' 视为关闭） */
import { readLocalStorage } from '@/utils/core/local-storage.util'


/** localStorage 中震动开关的存储键（'0' / 'false' 视为关闭） */
const HAPTICS_STORAGE_KEY = 'homeos_haptics'

/**
 * 判断是否允许震动：用户开启减少动效、或本地开关关闭、或环境无 vibrate 能力时返回 false。
 * 任意一步抛错均回退到能力检测。
 * @returns 是否允许震动
 */
function hapticsEnabled() {
  try {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return false
    }
    const stored = readLocalStorage(HAPTICS_STORAGE_KEY)
    if (stored === '0' || stored === 'false') return false
  } catch {
    /* 忽略 */
  }
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

/** 告警/安防反馈 */
export function hapticAlert() {
  if (!hapticsEnabled()) return
  try {
    navigator.vibrate([20, 40, 20])
  } catch {
    /* 忽略 */
  }
}
