/**
 * 联动器服务调用参数面板 composable
 *
 * 模块：orchestrator（联动器）
 * 职责：
 *  - 为自动化/脚本 Builder 中 call_service 动作维护「服务数据面板」的展开与表单状态
 *  - 与 util 层协议耦合：通过 showParamsKey 标识 action 上控制展开的字段名
 * 依赖：orchestrator-service-data.util（面板状态默认值、同步、重置）
 */
import { reactive } from 'vue'
import {
  DEFAULT_SERVICE_DATA_PANEL,
  applyActionServiceDataPanel,
  resetServiceDataPanel,
  supportsServiceDataBuilder,
  syncPanelFromActionData,
  actionServiceDataExpanded,
  toggleActionServiceDataPanel,
} from '@/utils/orchestrator/service-data.util'
import type { OrchestratorServiceAction } from '@/types/orchestrator-builder'

/**
 * 自动化/脚本 Builder 共用的 call_service 参数面板逻辑
 * @param showParamsKey action 上控制面板展开的字段名（_showParams / _showSbParams）
 * @returns 面板状态与一组操作方法
 */
export function useServiceDataPanel(showParamsKey: string = '_showParams') {
  // 响应式面板状态：拷贝默认值，避免共享引用污染
  const panel = reactive({ ...DEFAULT_SERVICE_DATA_PANEL })

  /** 判断指定 action 是否支持数据构造器（部分 service 仅接受自由 YAML） */
  function hasDataBuilder(action: OrchestratorServiceAction | null | undefined) {
    return supportsServiceDataBuilder(action)
  }

  /** 判断指定 action 的参数面板是否处于展开状态 */
  function showParams(action: OrchestratorServiceAction | null | undefined) {
    if (!action) return false
    return actionServiceDataExpanded(action, showParamsKey)
  }

  /** 切换 action 的参数面板展开/收起，并联动 panel 状态 */
  function toggleParams(action: OrchestratorServiceAction) {
    toggleActionServiceDataPanel(action, panel, showParamsKey)
  }

  /** 将面板当前数据应用到 action 上（点击「应用」按钮时调用） */
  function applyDataBuilder(action: OrchestratorServiceAction) {
    return applyActionServiceDataPanel(action, panel, showParamsKey)
  }

  /** 从 action.data 反向同步面板，用于加载历史 action 时回填参数 */
  function syncFromData(action: OrchestratorServiceAction) {
    syncPanelFromActionData(action, panel)
  }

  /** 重置面板状态到默认值 */
  function resetPanel() {
    resetServiceDataPanel(panel)
  }
  return {
    panel,
    hasDataBuilder,
    showParams,
    toggleParams,
    applyDataBuilder,
    syncFromData,
    resetPanel,
  }
}