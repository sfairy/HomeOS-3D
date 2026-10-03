/**
 * 安防面板布防/撤防工具模块。
 *
 * 职责：
 * - 调用后端 armSecurityPanel API 执行布防/撤防；
 * - 根据响应结果本地 patch 安防模式状态（供总览页与浮动 widget 共用）；
 * - 撤防时清空区域列表，布防时按传入 zoneIds 或全量 zones 更新状态。
 *
 * 依赖：armSecurityPanel（services/api/security）、SecurityModeSocketPayload 类型。
 */
/** 安防面板布防/撤防 API + 本地状态 patch（总览页与浮动 widget 共用） */
import { armSecurityPanel, disarmSecurityPanel } from '@/services/api/security'
import { hapticAlert } from '@/utils/ui/haptics.util'
import type { SecurityModeSocketPayload } from '@/utils/bridge/store-bridge'

/** 布防/撤防 API 响应结果 */
interface SecurityArmResult {
  success?: boolean
  mode?: string
  /** 是否跳过（如当前已是目标模式） */
  skipped?: boolean
  actions?: { executed?: number; failed?: number }
}

/**
 * 根据布防响应本地 patch 安防模式状态。
 *
 * 逻辑：
 * - 响应 mode 为 disarmed 时，patch 为撤防并清空区域；
 * - 否则 patch 为对应布防模式，区域列表优先用传入 zoneIds，为空时回退到全量 zones。
 *
 * @param mode 请求的目标模式
 * @param zoneIds 目标区域 ID 列表
 * @param zones 全量区域列表（zoneIds 为空时用作回退）
 * @param patchModeFromSocket 状态 patch 回调
 * @param data API 响应数据
 */
function patchArmedStateFromArmResponse(
  mode: string,
  zoneIds: string[],
  zones: Array<{ id: string }>,
  patchModeFromSocket: (data: SecurityModeSocketPayload) => void,
  data?: SecurityArmResult,
) {
  // 联动 fail-closed：后端未提交布防态时勿乐观 patch，避免 UI 假布防
  if (data?.success === false) return
  const resolvedMode = data?.mode || mode
  if (resolvedMode === 'disarmed') {
    patchModeFromSocket({ mode: 'disarmed', zones: [] })
    return
  }
  const armedIds = zoneIds.length ? zoneIds : zones.map((z) => z.id)
  patchModeFromSocket({ mode: resolvedMode, zones: armedIds })
}

/**
 * 执行安防面板布防/撤防：调用 API 并本地 patch 状态。
 *
 * @param mode 目标模式（如 armed_away、armed_home、disarmed）
 * @param zoneIds 目标区域 ID 列表
 * @param zones 全量区域列表
 * @param patchModeFromSocket 状态 patch 回调
 * @returns API 响应结果
 */
export async function executeSecurityPanelArm(
  mode: string,
  zoneIds: string[],
  zones: Array<{ id: string }>,
  patchModeFromSocket: (data: SecurityModeSocketPayload) => void,
): Promise<SecurityArmResult> {
  const { data } =
    mode === 'disarmed' ? await disarmSecurityPanel() : await armSecurityPanel(mode, zoneIds)
  // 高危操作触感反馈：仅真正提交成功且非跳过时触发
  if (data?.success !== false && !data?.skipped) hapticAlert()
  patchArmedStateFromArmResponse(mode, zoneIds, zones, patchModeFromSocket, data)
  return data || {}
}