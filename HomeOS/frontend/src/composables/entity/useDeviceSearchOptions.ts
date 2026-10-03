/**
 * @file useDeviceSearchOptions.ts
 * @module composables/entity
 * @description 设备搜索下拉选项 composable。
 *
 * 职责：根据是否启用 REST 模式，从内存或 REST API 解析设备搜索下拉选项；
 *      小库走内存（直接 map memoryItems），大库打开下拉时 REST 拉取建议。
 *
 * 依赖：
 * - @homeos/shared（getEntityDomain、resolveEntityArea）
 * - vue（ref、watch、Ref、ComputedRef）
 * - @/services/api/entities（fetchEntities）
 * - @/utils/entity/select.util（formatEntitySelectOption）
 * - @/utils/entity/derived.util（getEntityDisplayName）
 */
import { getEntityDomain, resolveEntityArea } from '@homeos/shared'
import { ref, watch, type Ref, type ComputedRef } from 'vue'
import { fetchEntities } from '@/services/api/entities'
import { formatEntitySelectOption } from '@/utils/entity/select.util'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
const MAX_OPTIONS = 500

/** 设备搜索行：来自内存或 REST 响应的最小行形状 */
type DeviceSearchRow = {
  entity_id: string
  name?: string
  domain?: string
  area?: unknown
  [key: string]: unknown
}

/**
 * 设备搜索下拉选项：小库走内存，大库打开下拉时 REST 拉取建议。
 *
 * @param useRest 是否启用 REST 模式（true：打开下拉时调用 API；false：用内存项）
 * @param domain 当前 domain 过滤
 * @param memoryItems 内存中的候选行
 * @returns options 下拉选项 ref；onDropdownOpen 打开下拉时按模式刷新；refreshFromApi 主动从 API 拉取
 */
export function useDeviceSearchOptions({
  useRest,
  domain,
  memoryItems,
}: {
  useRest: Ref<boolean> | ComputedRef<boolean>
  domain: Ref<string> | ComputedRef<string>
  memoryItems: Ref<DeviceSearchRow[] | unknown[]> | ComputedRef<DeviceSearchRow[] | unknown[]>
}) {
  const options = ref<ReturnType<typeof formatEntitySelectOption>[]>([])
  /** 将原始行映射为下拉选项，并限制最多 MAX_OPTIONS 项 */
  function mapRows(rows: DeviceSearchRow[] | unknown[]) {
    return (rows as DeviceSearchRow[])
      .slice(0, MAX_OPTIONS)
      .map((item) => formatEntitySelectOption(item.entity_id, item))
  }
  /** 从内存项同步下拉选项 */
  function syncFromMemory() {
    options.value = mapRows(memoryItems.value || [])
  }
  /**
   * 从 REST API 拉取建议：根据 search 与 domain 构造查询参数，
   * 解析响应并补齐 name/domain/area 后映射为选项；失败时清空。
   *
   * @param search 搜索关键字（可空）
   */
  async function refreshFromApi(search = '') {
    try {
      const params: Record<string, string | number> = { limit: 80, page: 1 }
      const q = search.trim()
      if (q) params.search = q
      if (domain.value && domain.value !== 'all') params.domain = domain.value
      const { data } = await fetchEntities(params, { timeout: 30000 })
      const payload = data as { entities?: Array<{ entity_id: string; attributes?: Record<string, unknown> }> } | undefined
      const rows = (payload?.entities || []).map((e) => {
        const key = e.entity_id
        const dom = getEntityDomain(key)
        return {
          entity_id: key,
          name: getEntityDisplayName(key, e),
          domain: dom,
          area: resolveEntityArea(e.attributes),
        }
      })
      options.value = mapRows(rows)
    } catch {
      // 失败时清空选项，避免展示过期数据
      options.value = []
    }
  }
  /** 打开下拉时按当前模式选择刷新方式 */
  async function onDropdownOpen() {
    if (useRest.value) await refreshFromApi()
    else syncFromMemory()
  }
  // 内存模式下监听变化即时同步；REST 模式等打开下拉时再拉取
  watch(
    [useRest, domain, memoryItems],
    () => {
      if (!useRest.value) syncFromMemory()
    },
    { immediate: true, deep: true },
  )
  return { options, onDropdownOpen, refreshFromApi }
}
