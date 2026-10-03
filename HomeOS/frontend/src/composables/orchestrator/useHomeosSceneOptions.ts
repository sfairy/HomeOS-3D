/**
 * @file useHomeosSceneOptions.ts
 * @module composables/orchestrator
 * @description HomeOS 场景列表下拉选项 composable。
 *
 * 职责：
 * - 加载 HomeOS 场景列表（fetchOrchestratorList('scene')）；
 * - 解析为下拉选项（值为 scene.id），支持可选的"不联动场景"空选项；
 * - 提供 labelForSceneId / labelsForSceneIds 反查标签方法。
 *
 * 依赖：
 * - vue（ref、computed、onMounted）
 * - @/services/api/orchestrator（fetchOrchestratorList）
 * - @/utils/core/logger（加载失败日志）
 */
import { ref, computed, onMounted } from 'vue'
import { fetchOrchestratorList } from '@/services/api/orchestrator'
import { logger } from '@/utils/core/logger'

/** HomeOS 场景记录：来自后端列表的最小行形状 */
interface HomeosSceneRecord {
  id: string
  name?: string
  runOnHa?: boolean
}

/** 下拉选项：值 / 标签 / 分组 / 提示 */
interface HomeosSceneSelectOption {
  value: string
  label: string
  group?: string
  hint?: string
}

/**
 * 归一化场景列表响应：兼容数组 / items 包装 / data 包装三种形态。
 *
 * @param data 原始响应体
 * @returns 解析后的场景记录数组
 */
function normalizeSceneList(data: unknown): HomeosSceneRecord[] {
  if (Array.isArray(data)) return data as HomeosSceneRecord[]
  if (data && typeof data === 'object') {
    const obj = data as { items?: HomeosSceneRecord[]; data?: HomeosSceneRecord[] }
    if (Array.isArray(obj.items)) return obj.items
    if (Array.isArray(obj.data)) return obj.data
  }
  return []
}

/**
 * 加载 HomeOS 场景列表，供设置页下拉选择（值为 scene.id）。
 *
 * @param opts.includeEmpty 是否包含"不联动场景"空选项（默认 true）
 * @param opts.emptyLabel 空选项标签文案（默认"不联动场景"）
 * @returns scenes 场景记录；loading 加载中标志；options 下拉选项；reload 重新加载；
 *          labelForSceneId 按 ID 取标签；labelsForSceneIds 批量取标签
 */
export function useHomeosSceneOptions(opts?: { includeEmpty?: boolean; emptyLabel?: string }) {
  const includeEmpty = opts?.includeEmpty !== false
  const emptyLabel = opts?.emptyLabel ?? '不联动场景'

  const scenes = ref<HomeosSceneRecord[]>([])
  const loading = ref(false)

  // 下拉选项：把场景记录映射为选项，可选地前置空选项
  const options = computed<HomeosSceneSelectOption[]>(() => {
    const items = scenes.value
      .map((scene) => ({
        value: String(scene.id ?? '').trim(),
        label: String(scene.name || scene.id || '').trim() || scene.id,
        group: 'HomeOS 场景',
        // HA 执行的场景显示 "HA 执行"提示，否则显示 ID
        hint: scene.runOnHa ? 'HA 执行' : scene.id,
      }))
      // 过滤掉 id 为空的无效项
      .filter((o) => o.value)

    if (!includeEmpty) return items
    return [{ value: '', label: emptyLabel, group: '' }, ...items]
  })

  /**
   * 重新加载场景列表；失败时静默清空（warn 日志），不阻塞页面。
   */
  async function reload() {
    loading.value = true
    try {
      const { data } = await fetchOrchestratorList('scene')
      scenes.value = normalizeSceneList(data)
    } catch (e) {
      logger.warn('HomeOS 场景列表加载失败', e)
      scenes.value = []
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
    return labelsForSceneIdsFromRecords(ids, scenes.value)
  }

  // 挂载时自动加载一次场景列表
  onMounted(reload)

  return { scenes, loading, options, reload, labelForSceneId, labelsForSceneIds }
}

/**
 * 从场景记录数组批量取标签；未命中回退到 ID 字符串。
 * 抽出为独立函数便于在无响应式场景下复用。
 *
 * @param ids 场景 ID 数组
 * @param sceneRecords 场景记录数组
 * @returns 标签数组
 */
function labelsForSceneIdsFromRecords(ids: string[], sceneRecords: HomeosSceneRecord[]) {
  return ids.map((id) => {
    const hit = sceneRecords.find((s) => s.id === id)
    return hit?.name || id
  })
}
