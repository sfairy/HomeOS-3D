/** 触觉反馈（震动）工具。 */

/** localStorage 中震动开关的存储键（'0' / 'false' 视为关闭） */
import { readLocalStorage } from '@/shared/utils/core/local-storage.util'

/** localStorage 中震动开关的存储键（'0' / 'false' 视为关闭） */
const HAPTICS_STORAGE_KEY = 'homeos_haptics'

/**
 * 当前 frame 是否已被用户「激活」过（点过一次即可，激活状态是粘性的）。
 *
 * Chrome 会拦截未激活 frame 的 navigator.vibrate 并打印
 * `Blocked call to navigator.vibrate because user hasn't tapped on the frame`，
 * 提前判掉可以避免这条 Intervention 噪音。不支持 userActivation 的环境放行。
 * @returns 是否允许调用 vibrate
 */
function hasUserActivation() {
  if (typeof navigator === 'undefined') return false
  const activation = (
    navigator as unknown as {
      userActivation?: { hasBeenActive?: boolean }
    }
  ).userActivation
  return activation?.hasBeenActive ?? true
}

/**
 * 判断是否允许震动：用户开启减少动效、或本地开关关闭、或环境无 vibrate 能力、
 * 或 frame 尚未被用户激活过时返回 false。任意一步抛错均回退到能力检测。
 * @returns 是否允许震动
 */
function hapticsEnabled() {
  try {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return false
    }
    const stored = readLocalStorage(HAPTICS_STORAGE_KEY)
    if (stored === '0' || stored === 'false') return false
  } catch {
    /* 忽略 */
  }
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' && hasUserActivation()
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

/**
 * 轻触反馈：对应源码 `triggerHaptic('light')`。
 *
 * 用在「操作已被接受」的瞬态节点：按下开始说话、上滑越过取消阈值、
 * 语音指令提交成功。8~12ms 是 Android 触感上「一下」的惯用档位。
 */
export function hapticTap() {
  if (!hapticsEnabled()) return
  try {
    navigator.vibrate(10)
  } catch {
    /* 忽略 */
  }
}

/**
 * 长按反馈：对应源码 `triggerHaptic('medium')`。
 *
 * 用在「手势已达标、即将进入持续录音」这一刻（源码给 800ms 超时等待）。
 * 用两段短震而不是单段长震：单段 >30ms 在多数机型上会被感知成「嗡」的故障感。
 */
export function hapticHold() {
  if (!hapticsEnabled()) return
  try {
    navigator.vibrate([12, 24, 12])
  } catch {
    /* 忽略 */
  }
}
