/**
 * @file useOrchestratorListPage.ts
 * @module composables/orchestrator
 * @description 联动器列表页统一 composable：聚合列表分页加载与 HA 同步状态。
 *
 * 职责：
 * - 通过 useListPageQuery 拉取联动器列表（带分页/错误兜底）；
 * - 通过 useOrchestratorHaSync 拉取每项联动器相对 HA 的同步状态；
 * - 计算漂移（drift）数量供 UI 标记。
 *
 * 依赖：
 * - vue（computed、ref）
 * - @/composables/ui/useListPageQuery（列表分页查询）
 * - @/composables/orchestrator/useOrchestratorHaSync（HA 同步状态）
 * - @/utils/orchestrator/list.util（漂移计数与列表项类型）
 */
import { computed, ref } from 'vue'
import { useListPageQuery } from '@/composables/ui/useListPageQuery'
import { useOrchestratorHaSync } from '@/composables/orchestrator/useOrchestratorHaSync'
import {
  countOrchestratorDrift,
  type OrchestratorListItem,
} from '@/utils/orchestrator/list.util'

/**
 * 联动器列表页：统一列表加载 + HA 同步状态。
 *
 * @param apiPrefix 列表/同步 API 前缀（如 'automation' / 'script' / 'scene'）
 * @param defaultErrorMsg 加载失败时的兜底错误文案
 * @returns list 分页能力、haSync 同步状态、syncLoading 同步中标志、driftCount 漂移数、loadList 串联加载方法
 */
export function useOrchestratorListPage(apiPrefix: string, defaultErrorMsg: string) {
  const list = useListPageQuery<OrchestratorListItem>(defaultErrorMsg)
  const haSync = useOrchestratorHaSync(apiPrefix)
  const syncLoading = ref(false)

  // 当前列表中相对 HA 漂移的条目数（用于 UI 角标提示）
  const driftCount = computed(() =>
    countOrchestratorDrift(list.items.value, haSync.syncStatusMap.value),
  )

  /**
   * 串联加载列表与同步状态：先加载列表，再批量拉取每项的 HA 同步状态。
   *
   * @param options.background 是否后台静默加载（默认：已有数据时为 true，首次为 false）
   */
  async function loadList(options?: { background?: boolean }) {
    const background = options?.background ?? list.items.value.length > 0
    await list.load(`/${apiPrefix}`, { background })
    syncLoading.value = true
    try {
      await haSync.loadSyncStatuses(list.items.value)
    } finally {
      syncLoading.value = false
    }
  }

  return {
    ...list,
    ...haSync,
    syncLoading,
    driftCount,
    loadList,
  }
}
