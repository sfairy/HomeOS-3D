/**
 * 悬浮伴侣位置工具
 * ---------------------------------------------------------------
 * 悬浮伴侣可自由拖动，位置以视口百分比中心点（`xPercent` / `yPercent`）保存。
 * 组件渲染与设置页滑块共用这里的归一化口径，避免两处换算结果对不上。
 */
import type { AgentCompanionConfig } from '@/domain/layout/types'

/** 机器人直径（px），与 AgentCompanion.vue 的 .companion-root / .companion-trigger 一致 */
export const AGENT_COMPANION_FACE_SIZE = 66

/** 默认配置：贴左 3%、垂直 60%（与 stores/defaults.ts 同源） */
const DEFAULT_AGENT_COMPANION: AgentCompanionConfig = {
  enabled: true,
  xPercent: 3,
  yPercent: 60,
}

/** 百分比统一保留一位小数，避免拖动时写出一长串浮点数 */
export function roundCompanionPercent(value: number): number {
  return Math.round(value * 10) / 10
}

/** 视口百分比夹紧到 0-100（离屏保护由渲染侧按像素再做一次） */
export function clampCompanionPercent(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return roundCompanionPercent(fallback)
  return roundCompanionPercent(Math.min(100, Math.max(0, n)))
}

/**
 * 归一化悬浮伴侣配置：非法值回到默认。
 * 保存与读取共用同一口径，避免手改成 200% 后存进布局、下次打开又跳回默认。
 */
export function normalizeAgentCompanion(raw?: Partial<AgentCompanionConfig> | null): AgentCompanionConfig {
  return {
    enabled: raw?.enabled !== false,
    xPercent: clampCompanionPercent(raw?.xPercent, DEFAULT_AGENT_COMPANION.xPercent),
    yPercent: clampCompanionPercent(raw?.yPercent, DEFAULT_AGENT_COMPANION.yPercent),
  }
}

/**
 * 悬浮层的定位坐标系尺寸。
 *
 * 壳层开启整页等比缩放时，`position: fixed` 的百分比是相对被缩放的 `.app-shell`
 * 解析的（而不是窗口），两者尺寸相差 1/scale 倍。这里直接读壳层布局尺寸，
 * 避免在 947px 的窗口里把 1684px 的落点算成 36%。
 */
export function resolveAgentCompanionStageSize(): { width: number; height: number } {
  if (typeof document !== 'undefined') {
    const teleportTarget = document.getElementById('teleport-target')
    const shell = (teleportTarget?.parentElement ??
      document.querySelector<HTMLElement>('.app-shell')) as HTMLElement | null
    if (shell && shell.offsetWidth > 0 && shell.offsetHeight > 0) {
      return { width: shell.offsetWidth, height: shell.offsetHeight }
    }
  }
  return {
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  }
}

/** 最终落点：两轴都按 0-100 夹紧（离屏像素保护在渲染侧）。 */
export function resolveAgentCompanionPosition(config: AgentCompanionConfig): {
  xPercent: number
  yPercent: number
} {
  return {
    xPercent: clampCompanionPercent(config.xPercent, DEFAULT_AGENT_COMPANION.xPercent),
    yPercent: clampCompanionPercent(config.yPercent, DEFAULT_AGENT_COMPANION.yPercent),
  }
}
