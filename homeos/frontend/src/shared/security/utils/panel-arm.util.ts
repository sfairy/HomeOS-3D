/** 安防面板布防/撤防工具模块。 */
/** 安防面板布防/撤防 API + 本地状态 patch（总览页与浮动 widget 共用） */
import { armSecurityPanel, disarmSecurityPanel } from '@/services/api/security'
import { hapticAlert } from '@/shared/utils/ui/haptics.util'
import type { SecurityModeSocketPayload } from '@/shared/utils/bridge/store-bridge'

/** 布防/撤防 API 响应结果 */
export interface SecurityArmResult {
  success?: boolean
  mode?: string
  /** 是否跳过（如当前已是目标模式） */
  skipped?: boolean
  /** 模式已提交但联动有失败（撤防 fail-open） */
  degraded?: boolean
  /** 模式是否已落库；`false` 表示只改了内存，重启会回退到上一次成功落库的模式 */
  persisted?: boolean
  actions?: { executed?: number; failed?: number }
}

/** 给 UI 层的布防/撤防结果解读 */
export type SecurityArmUiOutcome =
  | { kind: 'failed'; message: string }
  | { kind: 'partial'; message: string }
  | { kind: 'skipped' }
  | { kind: 'ok' }

/**
 * 解读布防/撤防 API 结果，供总览页与浮动 widget 共用提示文案。
 *
 * - 布防 fail-closed：`success===false` → failed
 * - 撤防 fail-open：模式已是 disarmed 但联动失败 → partial（警告，非错误）
 * - `degraded` 且 success → partial
 * - `persisted===false`：模式已生效但没落库 → 仍按已生效提示，不谎报失败
 */
export function interpretSecurityArmResult(
  requestedMode: string,
  modeLabel: string,
  data?: SecurityArmResult,
): SecurityArmUiOutcome {
  const failed = data?.actions?.failed ?? 0
  const committedDisarm = data?.mode === 'disarmed' && requestedMode === 'disarmed'
  const persistWarning = '（未能写入本机存储，重启后可能回退）'

  if (data?.success === false) {
    return {
      kind: 'failed',
      message:
        failed > 0
          ? `${modeLabel}未生效：${failed} 条联动失败，布防已取消`
          : `${modeLabel}未生效`,
    }
  }

  if (data?.skipped) return { kind: 'skipped' }

  if (data?.degraded || (committedDisarm && failed > 0)) {
    return {
      kind: 'partial',
      message:
        (requestedMode === 'disarmed'
          ? failed > 0
            ? `已撤防，但 ${failed} 条联动失败`
            : '已撤防，但部分联动未完成'
          : failed > 0
            ? `${modeLabel}已生效，但 ${failed} 条联动失败`
            : `${modeLabel}已生效，但部分联动未完成`) +
        (data?.persisted === false ? persistWarning : ''),
    }
  }

  // 模式已生效但没落库：不能当完全成功（重启会回退），也不该谎报失败。
  if (data?.persisted === false) {
    return {
      kind: 'partial',
      message:
        requestedMode === 'disarmed' ? `已撤防${persistWarning}` : `${modeLabel}已生效${persistWarning}`,
    }
  }

  return { kind: 'ok' }
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
  if (data?.success === false) {
    // 撤防 fail-open（含旧后端）：mode 已是 disarmed 时仍须同步 UI
    if (data.mode === 'disarmed') {
      patchModeFromSocket({ mode: 'disarmed', zones: [] })
    }
    return
  }
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
  // 高危操作触感反馈：仅真正提交成功且非跳过时触发（含撤防 degraded）
  if (data?.success !== false && !data?.skipped) hapticAlert()
  patchArmedStateFromArmResponse(mode, zoneIds, zones, patchModeFromSocket, data)
  return data || {}
}
