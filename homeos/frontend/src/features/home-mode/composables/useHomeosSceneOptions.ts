/** - 从实体缓存加载 HA 场景列表； */
import { ref, computed, onMounted, watch } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import {
  collectHaSceneScriptRecords,
  type HaSceneScriptRecord,
} from '@/shared/utils/ha/scene-script.util'
import {
  buildSceneOptions,
  sceneEntitiesSignature,
  type HomeosSceneSelectOption,
} from './scene-options.util'

/**
 * 加载 HA 场景列表，供设置页下拉选择（值为 scene entity_id）。
 *
 * 场景列表是**派生状态**：冷启动时实体缓存往往还是空的（懒加载路由 + 首帧还没收到
 * WebSocket 全量推送），而 `scene.*` 实体是之后才陆续到达的。若只在 `onMounted`
 * 读一次快照，下拉框会永久空白 —— 所以这里跟随 `entitiesStore.entities` 自动重算。
 *
 * @param opts.includeEmpty 是否包含“不联动场景”空选项（默认 true）
 * @param opts.emptyLabel 空选项标签文案（默认“不联动场景”）
 * @returns scenes 场景记录；loading 加载中标志；options 下拉选项；reload 重新加载；
 *          labelForSceneId 按 ID 取标签；labelsForSceneIds 批量取标签
 */
export function useHomeosSceneOptions(sceneOptionsInput?: { includeEmpty?: boolean; emptyLabel?: string }) {
  const includeEmpty = sceneOptionsInput?.includeEmpty !== false
  const emptyLabel = sceneOptionsInput?.emptyLabel ?? '不联动场景'
  const entitiesStore = useEntitiesStore()

  const scenes = ref<HaSceneScriptRecord[]>([])
  const loading = ref(false)
  /** 是否已经拿到过实体（用于区分「加载中」与「确实没有场景」）。 */
  const ready = ref(false)

  // 下拉选项：把场景记录映射为选项，可选地前置空选项
  const options = computed<HomeosSceneSelectOption[]>(() =>
    buildSceneOptions(scenes.value, { includeEmpty, emptyLabel }),
  )

  /** 重新加载场景列表 */
  function reload() {
    loading.value = true
    try {
      scenes.value = collectHaSceneScriptRecords(entitiesStore.entities, 'scene')
      ready.value = Object.keys(entitiesStore.entities ?? {}).length > 0
    } finally {
      loading.value = false
    }
  }

  // 实体缓存变化（WebSocket 增量 / 冷启动全量）时重算：`scenes` 依赖它，不能只读一次快照。
  // 用「scene.* 的 id + 显示名」做签名，避免 deep watch 整张实体表带来的开销。
  const sceneSignature = computed(() => sceneEntitiesSignature(entitiesStore.entities))
  watch(sceneSignature, () => reload())

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

  return { scenes, loading, ready, options, reload, labelForSceneId, labelsForSceneIds }
}
