/**
 * @file useDriftRepair.ts
 * @module composables/orchestrator
 * @description 联动器漂移修复向导 composable。
 *
 * 职责：
 * - 扫描联动器各域（自动化/脚本/场景等）相对 Home Assistant 的漂移项；
 * - 提供单条修复（push/pull）与批量修复能力；
 * - 维护向导步骤（0=未扫描/出错，1=待修复列表，2=完成）与修复日志。
 *
 * 依赖：
 * - vue（ref）
 * - @/utils/orchestrator/sync-issues.util（漂移项收集、域配置、域标签）
 * - @/services/api/orchestrator（repairOrchestratorDrift 修复 API）
 * - @/utils/orchestrator/sync-status-cache.util（修复成功后失效同步缓存前缀）
 * - @/utils/core/error-message（API 错误文案兜底）
 */
import { ref } from 'vue'
import {
  ORCHESTRATOR_DOMAINS,
  ORCHESTRATOR_DOMAIN_LABELS,
  collectOrchestratorDriftItems,
  fetchOrchestratorDomainLists,
} from '@/utils/orchestrator/sync-issues.util'
import { repairOrchestratorDrift } from '@/services/api/orchestrator'
import { invalidateOrchestratorSyncPrefix } from '@/utils/orchestrator/sync-status-cache.util'
import { getApiErrorMessage } from '@/utils/core/error-message'

/** 漂移修复向导中的单个漂移条目（domain 对应 ORCHESTRATOR_DOMAINS 的键） */
interface DriftItem {
  domain: keyof typeof ORCHESTRATOR_DOMAINS
  id: string | number
  name?: string
  status?: Record<string, unknown>
}

/**
 * 扫描联动器漂移项并支持逐步修复。
 *
 * @returns driftItems 漂移条目列表；scanning 扫描中标志；repairing 单条修复中标志；
 *          wizardStep 向导步骤；repairLog 修复日志；scanError 扫描错误文案；
 *          scanDrift 扫描方法；repairOne 单条修复；repairAll 批量修复；domainLabel 域中文标签
 */
export function useDriftRepair() {
  const driftItems = ref<DriftItem[]>([])
  const scanning = ref(false)
  const repairing = ref(false)
  const wizardStep = ref(0)
  const repairLog = ref<Array<{ at: string; label: string; ok: boolean; message: string }>>([])
  const scanError = ref<string>('')

  /**
   * 扫描所有联动器域，收集漂移条目并推进向导步骤。
   * 部分域加载失败时记入 scanError，但其余域仍可继续修复；全部失败则停留步骤 0。
   */
  async function scanDrift() {
    scanning.value = true
    driftItems.value = []
    repairLog.value = []
    wizardStep.value = 0
    scanError.value = ''
    try {
      const { lists, failedDomains } = await fetchOrchestratorDomainLists()
      if (failedDomains.length) {
        const labels = failedDomains.map((d) => ORCHESTRATOR_DOMAIN_LABELS[d] || d).join('、')
        scanError.value = `部分联动器列表加载失败：${labels}`
      }
      driftItems.value = await collectOrchestratorDriftItems(lists)
      if (failedDomains.length && !driftItems.value.length) {
        wizardStep.value = 0
      } else {
        // 步骤 1：有待修复项；步骤 2：扫描成功但无漂移
        wizardStep.value = driftItems.value.length ? 1 : 2
      }
    } catch (e) {
      scanError.value = getApiErrorMessage(e, '扫描失败')
      wizardStep.value = 0
    } finally {
      scanning.value = false
    }
  }

  /**
   * 修复单条漂移项：调用后端 push/pull 接口，成功后从列表移除并失效该域同步缓存。
   *
   * @param item 漂移条目
   * @param direction 修复方向（'push' 推送本地到 HA / 'pull' 拉取 HA 到本地）
   * @returns 是否修复成功
   */
  async function repairOne(item: DriftItem, direction = 'push') {
    repairing.value = true
    const cfg = ORCHESTRATOR_DOMAINS[item.domain]
    try {
      const { data } = await repairOrchestratorDrift(cfg.apiPrefix, String(item.id), direction)
      const ok = data?.success === true
      // 成功后失效该 apiPrefix 的同步缓存，避免下次扫描读到旧状态
      if (ok) invalidateOrchestratorSyncPrefix(cfg.apiPrefix)
      repairLog.value.unshift({
        at: new Date().toISOString(),
        label: `${cfg.label || item.domain} · ${item.name}`,
        ok,
        message: data?.message || (ok ? '已修复' : '修复失败'),
      })
      if (ok) {
        // 从列表移除已修复项，驱动 UI 实时更新
        driftItems.value = driftItems.value.filter(
          (d) => !(d.domain === item.domain && d.id === item.id),
        )
      }
      return ok
    } catch (e) {
      repairLog.value.unshift({
        at: new Date().toISOString(),
        label: `${cfg?.label || item.domain} · ${item.name}`,
        ok: false,
        message: getApiErrorMessage(e, '请求失败'),
      })
      return false
    } finally {
      repairing.value = false
    }
  }

  /**
   * 批量修复当前所有漂移条目（按队列顺序串行执行）。
   * 全部修复完成后推进向导到步骤 2（完成）。
   */
  async function repairAll(direction = 'push') {
    // 复制快照，避免修复过程中 driftItems 变化导致漏处理
    const queue = [...driftItems.value]
    for (const item of queue) {
      await repairOne(item, direction)
    }
    if (!driftItems.value.length) wizardStep.value = 2
  }

  // 域中文标签映射，供 UI 渲染使用
  const domainLabel = ORCHESTRATOR_DOMAIN_LABELS
  return {
    driftItems,
    scanning,
    repairing,
    wizardStep,
    repairLog,
    scanError,
    scanDrift,
    repairOne,
    repairAll,
    domainLabel,
  }
}
