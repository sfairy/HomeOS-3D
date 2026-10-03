/**
 * 推荐采纳向导 composable
 *
 * 模块：orchestrator（联动器）
 * 职责：
 *  - 管理推荐项采纳向导的弹窗状态、占位符建议加载与替换映射
 *  - 调用后端接口拉取推荐项的占位符候选，预填首项建议
 *  - 在用户确认后以 replacements 调用采纳接口；占位未替换完时仅保存不启用
 * 依赖：system API（推荐占位符与采纳）、chrome.store（通知反馈）
 */
import { ref, computed } from 'vue'
import { adoptRecommendation, fetchRecommendationPlaceholders } from '@/services/api/system'
import { useChromeStore } from '@/stores/chrome.store'
import { getApiErrorMessage } from '@/utils/core/error-message'

/** 占位符建议行：每个占位符对应一组候选替换值 */
interface PlaceholderRow {
  /** 占位符原文，如 ``${placeholder}`` */
  placeholder: string
  /** 占位符所属 domain（用于提示语境，非必填） */
  domain: string
  /** 占位符的语义说明 */
  hint: string
  /** 候选替换值列表，按推荐顺序排列 */
  suggestions: string[]
}

/**
 * 推荐采纳向导 composable 入口
 * @returns 弹窗状态、加载/保存中标志、占位符行、替换映射、未替换计数与采纳方法
 */
export function useRecommendationAdoptWizard() {
  const chrome = useChromeStore()
  /** 弹窗是否打开 */
  const open = ref(false)
  /** 占位符建议加载中 */
  const loading = ref(false)
  /** 采纳请求保存中 */
  const saving = ref(false)
  /** 当前推荐的 id */
  const recommendationId = ref('')
  /** 当前推荐的标题（弹窗展示用） */
  const recommendationTitle = ref('')
  /** 占位符建议行列表 */
  const rows = ref<PlaceholderRow[]>([])
  /** 用户已选择的替换映射：placeholder -> 实际值 */
  const replacements = ref<Record<string, string>>({})

  /** 未替换占位符数量：值为空或仍等于占位符原文均视为未替换 */
  const unresolvedCount = computed(
    () =>
      rows.value.filter((row) => {
        const val = String(replacements.value[row.placeholder] || '').trim()
        return !val || val === row.placeholder
      }).length,
  )

  /** 是否可以在采纳后直接启用：存在占位符且全部替换完成 */
  const canEnableAfter = computed(() => rows.value.length > 0 && unresolvedCount.value === 0)

  /**
   * 打开向导并加载指定推荐的占位符建议
   * @param id 推荐 id
   * @param title 推荐标题（可选，默认空字符串）
   * @returns 加载失败时关闭弹窗并提示错误
   */
  async function openForRecommendation(id: string, title = '') {
    recommendationId.value = id
    recommendationTitle.value = title || ''
    open.value = true
    loading.value = true
    replacements.value = {}
    try {
      const { data } = await fetchRecommendationPlaceholders(id)
      // 后端返回结构兼容：suggestions 字段为占位符建议行数组
      rows.value = Array.isArray((data as { suggestions?: PlaceholderRow[] })?.suggestions)
        ? (data as { suggestions: PlaceholderRow[] }).suggestions
        : []
      // 默认预填每个占位符的首个建议，降低用户填写成本
      const initial: Record<string, string> = {}
      for (const row of rows.value) {
        initial[row.placeholder] = row.suggestions?.[0] || ''
      }
      replacements.value = initial
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '加载占位建议失败'), 'error')
      open.value = false
    } finally {
      loading.value = false
    }
  }

  /** 关闭弹窗（不进行采纳） */
  function close() {
    open.value = false
  }

  /**
   * 以当前替换映射调用采纳接口
   * @returns 成功时返回后端响应数据；失败时返回 null
   * @sideEffect 当存在未替换占位符时仅保存不启用，并通过 warning 提示用户
   */
  async function adoptWithReplacements() {
    if (!recommendationId.value) return null
    // 仅提交与占位符不同的有效替换，避免无意义 payload
    const map: Record<string, string> = {}
    for (const [from, to] of Object.entries(replacements.value)) {
      const dst = String(to || '').trim()
      if (dst && dst !== from) map[from] = dst
    }
    const enableAfter = canEnableAfter.value
    // 占位符未替换完时仍允许采纳，但禁止启用，需向用户明确说明
    if (rows.value.length > 0 && unresolvedCount.value > 0) {
      chrome.notify(`仍有 ${unresolvedCount.value} 个占位未替换，采纳后将保持禁用状态`, 'warning')
    }
    saving.value = true
    try {
      const { data } = await adoptRecommendation(recommendationId.value, {
        // 无替换时省略 replacements，让后端按原样处理
        replacements: Object.keys(map).length ? map : undefined,
        enableAfter,
      })
      close()
      return data
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '采纳失败'), 'error')
      return null
    } finally {
      saving.value = false
    }
  }

  return {
    open,
    loading,
    saving,
    recommendationId,
    recommendationTitle,
    rows,
    replacements,
    unresolvedCount,
    canEnableAfter,
    openForRecommendation,
    close,
    adoptWithReplacements,
  }
}