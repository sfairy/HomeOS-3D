/**
 * @file useHomeosSceneOptions.ts
 * @module composables/home-mode
 * @description HA 场景列表下拉选项 composable（HomeOS 编排场景已移除，直接列 HA `scene.*` 实体）。
 *
 * 职责：
 * - 从实体缓存加载 HA 场景列表；
 * - 解析为下拉选项（值为 scene entity_id），支持可选的“不联动场景”空选项；
 * - 提供 labelForSceneId / labelsForSceneIds 反查标签方法。
 *
 * 依赖：vue、@/stores/entities.store、@/utils/ha/scene-script.util。
 */
import { ref, computed, onMounted } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import {
  collectHaSceneScriptRecords,
  type HaSceneScriptRecord,
} from '@/utils/ha/scene-script.util'

/** 下拉选项：值 / 标签 / 分组 / 提示 */
interface HomeosSceneSelectOption {
  value: string
  label: string
  group?: string
  hint?: string
}

/**
 * 加载 HA 场景列表，供设置页下拉选择（值为 scene entity_id）。
 *
 * @param opts.includeEmpty 是否包含“不联动场景”空选项（默认 true）
 * @param opts.emptyLabel 空选项标签文案（默认“不联动场景”）
 * @returns scenes 场景记录；loading 加载中标志；options 下拉选项；reload 重新加载；
 *          labelForSceneId 按 ID 取标签；labelsForSceneIds 批量取标签
 */
export function useHomeosSceneOptions(opts?: { includeEmpty?: boolean; emptyLabel?: string }) {
  const includeEmpty = opts?.includeEmpty !== false
  const emptyLabel = opts?.emptyLabel ?? '不联动场景'
  const entitiesStore = useEntitiesStore()

  const scenes = ref<HaSceneScriptRecord[]>([])
  const loading = ref(false)

  // 下拉选项：把场景记录映射为选项，可选地前置空选项
  const options = computed<HomeosSceneSelectOption[]>(() => {
    const items = scenes.value
      .map((scene) => ({
        value: String(scene.id ?? '').trim(),
        label: String(scene.name || scene.id || '').trim() || scene.id,
        group: 'HA 场景',
        hint: 'HA 执行',
      }))
      .filter((o) => o.value)

    if (!includeEmpty) return items
    return [{ value: '', label: emptyLabel, group: '' }, ...items]
  })

  /** 重新加载场景列表 */
  function reload() {
    loading.value = true
    try {
      scenes.value = collectHaSceneScriptRecords(entitiesStore.entities, 'scene')
    } finally {
      loading.value = false
    }
  }

  /**
   * 按 scene ID 取中文标签；未命中回退到 ID 字符串本身。
   * @param id 场景 ID
   * @returns 中文标签或 ID 字符串
   */
  function labelForSceneId(id: string) {
    const trimmed = String(id ?? '').trim()
    if (!trimmed) return ''
    return options.value.find((o) => o.value === trimmed)?.label ?? trimmed
  }

  /**
   * 批量按 ID 取标签；未命中的项回退到 ID 字符串。
   * @param ids 场景 ID 数组
   * @returns 标签数组（与 ids 一一对应）
   */
  function labelsForSceneIds(ids: string[]) {
    return ids.map((id) => {
      const hit = scenes.value.find((s) => s.id === id)
      return hit?.name || id
    })
  }

  onMounted(reload)

  return { scenes, loading, options, reload, labelForSceneId, labelsForSceneIds }
}
