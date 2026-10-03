/**
 * @module useAreaOptions
 * @description HA 区域（room/area）选项组合式函数。
 *
 * 职责：
 * - 从后端 area_registry 拉取区域列表，并提供给筛选/批量操作下拉使用。
 * - 当注册表接口不可用时，回退到实体 attributes 中携带的 area_id 推导区域集合。
 *
 * 依赖：
 * - @homeos/shared：resolveEntityArea 从实体属性中解析区域。
 * - vue：ref/computed/onMounted。
 * - @/services/api/entities：fetchAreasList 拉取区域注册表。
 * - @/stores/entities.store：实体全量映射与域索引。
 * - @/utils/bridge/store-bridge：appNotify 全局通知。
 * - @/utils/entity/entity-derived.util：collectIndexedEntityIds 收集索引实体 ID。
 */
import { resolveEntityArea } from '@homeos/shared'
import { ref, computed, onMounted } from 'vue'
import { fetchAreasList } from '@/services/api/entities'
import { useEntitiesStore } from '@/stores/entities.store'
import { appNotify } from '@/utils/bridge/store-bridge'
import { collectIndexedEntityIds } from '@/utils/entity/derived.util'

/** 区域下拉选项结构：id 为 HA area_id，name 为展示名。 */
type AreaOption = { id: string; name: string }

/**
 * HA area_registry 区域列表；失败时回退到实体 attributes 中的 area_id。
 *
 * 组件挂载时自动触发 refresh；对外暴露 resolvedAreas（注册表优先，否则回退）、
 * filterRoomOptions（带"全部房间"项）、batchRoomOptions（仅区域集合）等。
 *
 * @returns 区域选项、加载状态、降级标记与手动刷新方法。
 */
export function useAreaOptions() {
  const entitiesStore = useEntitiesStore()
  /** 注册表区域列表，刷新成功后填充。 */
  const registryAreas = ref<AreaOption[]>([])
  /** 是否完成首次加载。 */
  const loaded = ref(false)
  /** 注册表是否处于降级模式（接口失败或后端标记 registryDegraded）。 */
  const registryDegraded = ref(false)

  /**
   * 拉取区域注册表并刷新 registryAreas。
   * 失败时清空列表并标记降级，最终将 loaded 置为 true。
   */
  async function refresh() {
    try {
      const { data } = await fetchAreasList<{
        areas?: AreaOption[]
        registryDegraded?: boolean
        registryError?: string | null
      }>()
      const rows = Array.isArray(data?.areas) ? data.areas : []
      // 规范化：补全缺失字段、过滤掉无 id 的脏数据
      registryAreas.value = rows
        .map((row) => ({
          id: String(row.id || '').trim(),
          name: String(row.name || row.id || '').trim(),
        }))
        .filter((row) => row.id)
      registryDegraded.value = Boolean(data?.registryDegraded)
      if (registryDegraded.value) {
        appNotify('HA 区域注册表暂不可用，已回退到实体属性中的区域列表', 'warning', 6000)
      }
    } catch {
      // 接口异常：清空注册表并进入降级模式
      registryAreas.value = []
      registryDegraded.value = true
    } finally {
      loaded.value = true
    }
  }

  // 组件挂载时自动拉取一次区域列表
  onMounted(refresh)

  /**
   * 回退区域集合：遍历全量实体（优先走 domain 索引），从 attributes 中提取 area_id。
   * 按中文 locale 排序，保证展示稳定。
   */
  const fallbackFromEntities = computed(() => {
    const byId = new Map<string, string>()
    const ids =
      collectIndexedEntityIds(entitiesStore.domainEntityIndex, { domain: 'all' }) ||
      Object.keys(entitiesStore.entities)
    for (const key of ids) {
      const area = resolveEntityArea(entitiesStore.entities[key]?.attributes)
      if (!area) continue
      byId.set(area.id, area.name)
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  })

  /** 最终生效的区域集合：注册表非空时优先，否则使用回退集合。 */
  const resolvedAreas = computed(() => {
    if (registryAreas.value.length) return registryAreas.value
    return fallbackFromEntities.value
  })

  /** 筛选用房间选项：在区域集合前追加"全部房间"占位项。 */
  const filterRoomOptions = computed(() => [{ id: '', name: '全部房间' }, ...resolvedAreas.value])

  /** 批量操作用房间选项：直接暴露区域集合，不含占位项。 */
  const batchRoomOptions = computed(() => resolvedAreas.value)

  return {
    resolvedAreas,
    filterRoomOptions,
    batchRoomOptions,
    loaded,
    registryDegraded,
    refresh,
  }
}