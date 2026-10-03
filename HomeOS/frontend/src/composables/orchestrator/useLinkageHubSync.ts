/**
 * @file useLinkageHubSync.ts
 * @module composables/orchestrator
 * @description LinkageHub HA 批量同步 / 漂移修复（从 useLinkageHub 拆出）。
 *
 * 职责：
 * - 提供"一键推送所有联动器到 HA"（syncAllToHa）的封装与忙碌态管理；
 * - 提供"一键修复所有漂移"（repairAllDrift）的封装与忙碌态管理；
 * - 在执行前校验权限（仅管理员或成人可操作）。
 *
 * 依赖：
 * - vue（ComputedRef、Ref、ref）
 * - @/stores/chrome.store（通知）
 * - @/services/notify（异常文案兜底）
 * - @/composables/orchestrator/linkage-hub.types（tab 类型）
 * - @/utils/orchestrator/list.util（列表项类型）
 */
import { type ComputedRef, type Ref, ref } from 'vue'
import { useChromeStore } from '@/stores/chrome.store'
import { notifyError } from '@/services/notify'
import type { LinkageHubTab } from '@/composables/orchestrator/linkage-hub.types'
import type { OrchestratorListItem } from '@/utils/orchestrator/list.util'

/** 列表层暴露的同步/修复接口形状 */
type SyncListState = {
  syncAllToHa: () => Promise<{ ok?: boolean; message?: string }>
  repairAllDrift: (
    direction?: string,
    items?: OrchestratorListItem[] | null,
  ) => Promise<{ ok?: boolean; message?: string }>
}

/**
 * LinkageHub 批量同步与漂移修复封装。
 *
 * @param deps.canManageOrchestrator 是否具备联动器管理权限（管理员/成人）
 * @param deps.activeTab 当前激活的 LinkageHub 标签（overview 时不执行）
 * @param deps.listState 当前列表层 syncAllToHa / repairAllDrift 能力
 * @param deps.items 当前列表项（用于 repairAllDrift 显式传参）
 * @param deps.reloadActiveList 操作完成后重新加载当前列表
 * @returns hubSyncBusy 同步/修复中标志；hubSyncBusyLabel 忙碌文案；hubSyncAllToHa 一键推送；hubRepairAllDrift 一键修复
 */
export function useLinkageHubSync(deps: {
  canManageOrchestrator: ComputedRef<boolean>
  activeTab: Ref<LinkageHubTab>
  listState: ComputedRef<SyncListState>
  items: ComputedRef<OrchestratorListItem[]>
  reloadActiveList: () => Promise<void>
}) {
  const chrome = useChromeStore()
  const hubSyncBusy = ref(false)
  const hubSyncBusyLabel = ref('')

  /**
   * 一键推送当前列表所有联动器到 Home Assistant。
   * 权限不足或处于 overview 标签时直接返回；执行结果通过 chrome.notify 反馈。
   */
  async function hubSyncAllToHa() {
    if (!deps.canManageOrchestrator.value) {
      chrome.notify('仅管理员或成人可推送同步', 'warning')
      return
    }
    // overview 标签无具体列表，跳过
    if (deps.activeTab.value === 'overview') return
    hubSyncBusy.value = true
    hubSyncBusyLabel.value = '正在推送到 HA…'
    try {
      const result = await deps.listState.value.syncAllToHa()
      chrome.notify(
        result.message || (result.ok ? '已全部推送' : '推送未完成'),
        result.ok ? 'success' : 'warning',
      )
      await deps.reloadActiveList()
    } catch (e) {
      notifyError(e, '批量推送失败')
    } finally {
      hubSyncBusy.value = false
      hubSyncBusyLabel.value = ''
    }
  }

  /**
   * 一键修复当前列表所有漂移条目（默认 push 方向）。
   * 权限不足或处于 overview 标签时直接返回。
   */
  async function hubRepairAllDrift() {
    if (!deps.canManageOrchestrator.value) {
      chrome.notify('仅管理员或成人可修复漂移', 'warning')
      return
    }
    if (deps.activeTab.value === 'overview') return
    hubSyncBusy.value = true
    hubSyncBusyLabel.value = '正在修复漂移…'
    try {
      const result = await deps.listState.value.repairAllDrift('push', deps.items.value)
      chrome.notify(
        result.message || (result.ok ? '漂移已修复' : '部分修复失败'),
        result.ok ? 'success' : 'warning',
      )
      await deps.reloadActiveList()
    } catch (e) {
      notifyError(e, '修复漂移失败')
    } finally {
      hubSyncBusy.value = false
      hubSyncBusyLabel.value = ''
    }
  }

  return {
    hubSyncBusy,
    hubSyncBusyLabel,
    hubSyncAllToHa,
    hubRepairAllDrift,
  }
}
