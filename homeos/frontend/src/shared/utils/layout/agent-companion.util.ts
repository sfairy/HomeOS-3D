/**
 * 悬浮伴侣位置工具
 * ---------------------------------------------------------------
 * 悬浮伴侣既能自由拖动（`xPercent` / `yPercent` 记录视口百分比中心点），
 * 也要兼容旧布局里只有「停靠侧边 + 垂直高度」的配置。
 * 组件渲染与设置页滑块共用这里的归一化口径，避免两处换算结果对不上。
 */
import type { AgentCompanionConfig } from '@/shared/types/layout'

/** 圆脸直径（px），与 AgentCompanion.vue 的样式保持一致 */
export const AGENT_COMPANION_FACE_SIZE = 56
/** 离屏最小间距（px） */
export const AGENT_COMPANION_EDGE_GAP = 14
/** 旧版垂直停靠高度的允许区间（与设置页滑块一致） */
export const AGENT_COMPANION_MIN_TOP = 15
export const AGENT_COMPANION_MAX_TOP = 85

/** 默认配置：贴左停靠、垂直 60%（与 stores/defaults.ts 同源） */
export const DEFAULT_AGENT_COMPANION: AgentCompanionConfig = {
  enabled: true,
  side: 'left',
  topPercent: 60,
}

/** 百分比统一保留一位小数，避免拖动时写出一长串浮点数 */
export function roundCompanionPercent(value: number): number {
  return Math.round(value * 10) / 10
}

/** 自由位置的视口百分比夹紧到 0-100（离屏保护由渲染侧按像素再做一次） */
export function clampCompanionPercent(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return roundCompanionPercent(fallback)
  return roundCompanionPercent(Math.min(100, Math.max(0, n)))
}

/**
 * 归一化悬浮伴侣配置：非法值回到默认，自由位置两轴都有效才启用。
 * 保存与读取共用同一口径，避免手改成 200% 后存进布局、下次打开又跳回默认。
 */
export function normalizeAgentCompanion(
  raw?: Partial<AgentCompanionConfig> | null,
): AgentCompanionConfig {
  const top = Number(raw?.topPercent)
  const x = Number(raw?.xPercent)
  const y = Number(raw?.yPercent)
  const hasFreePosition =
    raw?.xPercent != null && raw?.yPercent != null && Number.isFinite(x) && Number.isFinite(y)
  return {
    enabled: raw?.enabled !== false,
    side: raw?.side === 'right' ? 'right' : 'left',
    topPercent: Number.isFinite(top)
      ? Math.min(AGENT_COMPANION_MAX_TOP, Math.max(AGENT_COMPANION_MIN_TOP, Math.round(top)))
      : DEFAULT_AGENT_COMPANION.topPercent,
    ...(hasFreePosition
      ? {
          xPercent: clampCompanionPercent(x, 50),
          yPercent: clampCompanionPercent(y, 60),
        }
      : {}),
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

/** 解析旧版停靠配置对应的视口百分比中心点（与组件渲染同一口径） */
export function resolveAgentCompanionFallback(
  config: AgentCompanionConfig,
  deps: {
    panelPosition?: string
    panelWidth?: number
    viewportWidth: number
    viewportHeight: number
  },
): { xPercent: number; yPercent: number } {
  const width = deps.viewportWidth > 0 ? deps.viewportWidth : 1
  const panelPosition = deps.panelPosition === 'left' ? 'left' : 'right'
  const panelWidth = Number(deps.panelWidth) || 0
  // 与信息侧栏同侧时退到侧栏内侧，避免小管家压在右栏部件上
  const inset =
    panelPosition === config.side ? AGENT_COMPANION_EDGE_GAP + panelWidth : AGENT_COMPANION_EDGE_GAP
  const half = AGENT_COMPANION_FACE_SIZE / 2
  const centerX = config.side === 'left' ? inset + half : width - inset - half
  return {
    xPercent: clampCompanionPercent((centerX / width) * 100, 50),
    yPercent: clampCompanionPercent(config.topPercent, 60),
  }
}

/** 最终落点：优先用自由位置，否则回退到旧版停靠配置 */
export function resolveAgentCompanionPosition(
  config: AgentCompanionConfig,
  deps: {
    panelPosition?: string
    panelWidth?: number
    viewportWidth: number
    viewportHeight: number
  },
): { xPercent: number; yPercent: number } {
  if (config.xPercent != null && config.yPercent != null) {
    return {
      xPercent: clampCompanionPercent(config.xPercent, 50),
      yPercent: clampCompanionPercent(config.yPercent, 60),
    }
  }
  return resolveAgentCompanionFallback(config, deps)
}
