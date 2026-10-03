/**
 * @file useOrchestratorPlaceholderWizard.ts
 * @module composables/orchestrator
 * @description 联动器占位实体替换向导 composable。
 *
 * 职责：
 * - 打开向导时拉取联动器 YAML 中识别出的占位实体（如占位 sensor/switch 等）；
 * - 为每个占位提供候选建议并允许用户替换为真实实体 ID；
 * - 提交替换到后端，并展示剩余占位数提示。
 *
 * 依赖：
 * - vue（ref）
 * - @/services/api/orchestrator（fetchOrchestratorPlaceholders / replaceOrchestratorPlaceholders）
 * - @/stores/chrome.store（通知）
 * - @/utils/core/error-message（错误文案兜底）
 */
import { ref } from 'vue'
import {
  fetchOrchestratorPlaceholders,
  replaceOrchestratorPlaceholders,
  type OrchestratorKind,
} from '@/services/api/orchestrator'
import { useChromeStore } from '@/stores/chrome.store'
import { getApiErrorMessage } from '@/utils/core/error-message'

/** 单个占位行的展示数据：占位 ID、域、提示与候选建议 */
interface PlaceholderRow {
  placeholder: string
  domain: string
  hint: string
  suggestions: string[]
}

/**
 * 联动器占位实体替换向导。
 *
 * @returns open 向导开关；loading 扫描中标志；saving 提交中标志；
 *          entityKind/entityId/entityName 当前联动器信息；rows 占位行列表；replacements 替换映射；
 *          openFor 打开并扫描；close 关闭；applyReplacements 提交替换
 */
export function useOrchestratorPlaceholderWizard() {
  const chrome = useChromeStore()
  const open = ref(false)
  const loading = ref(false)
  const saving = ref(false)
  const entityKind = ref<OrchestratorKind>('automation')
  const entityId = ref('')
  const entityName = ref('')
  const rows = ref<PlaceholderRow[]>([])
  const replacements = ref<Record<string, string>>({})

  /**
   * 打开向导并扫描指定联动器中的占位实体。
   * 初始化时把每个占位的第一个建议填入 replacements 作为默认值。
   *
   * @param id 联动器 ID
   * @param name 联动器显示名
   * @param kind 联动器类型（automation/script/scene）
   */
  async function openFor(id: string, name = '', kind: OrchestratorKind = 'automation') {
    entityId.value = id
    entityName.value = name != null ? String(name) : ''
    entityKind.value = kind
    open.value = true
    loading.value = true
    replacements.value = {}
    try {
      const { data } = await fetchOrchestratorPlaceholders(kind, id)
      rows.value = Array.isArray((data as { suggestions?: PlaceholderRow[] })?.suggestions)
        ? (data as { suggestions: PlaceholderRow[] }).suggestions
        : []
      // 默认填入每行的第一个建议，便于用户直接提交
      const initial: Record<string, string> = {}
      for (const row of rows.value) {
        initial[row.placeholder] = row.suggestions?.[0] || ''
      }
      replacements.value = initial
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '扫描占位实体失败'), 'error')
      open.value = false
    } finally {
      loading.value = false
    }
  }

  /** 关闭向导。 */
  function close() {
    open.value = false
  }

  /**
   * 提交占位替换：过滤掉空值与未变更项后调用后端 API。
   * 成功后展示剩余占位数提示并关闭向导。
   *
   * @returns 是否提交成功
   */
  async function applyReplacements() {
    if (!entityId.value) return false
    const map: Record<string, string> = {}
    for (const [from, to] of Object.entries(replacements.value)) {
      const dst = String(to || '').trim()
      // 跳过空值与未变更项
      if (dst && dst !== from) map[from] = dst
    }
    if (!Object.keys(map).length) {
      chrome.notify('请至少替换一个占位实体', 'warning')
      return false
    }
    saving.value = true
    try {
      const kind = entityKind.value
      const { data } = await replaceOrchestratorPlaceholders(kind, entityId.value, map)
      // 后端返回剩余占位数：仍 >0 表示未完全替换
      const remaining = (data as { remaining?: number })?.remaining
      chrome.notify(
        remaining != null && remaining > 0
          ? `已替换 ${Object.keys(map).length} 项，仍有 ${remaining} 个占位待处理`
          : '占位实体已全部替换',
        remaining != null && remaining > 0 ? 'info' : 'success',
      )
      close()
      return true
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '替换失败'), 'error')
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    open,
    loading,
    saving,
    entityKind,
    entityId,
    entityName,
    rows,
    replacements,
    openFor,
    close,
    applyReplacements,
  }
}
