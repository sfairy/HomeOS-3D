/**
 * @file 自适应气候 / 昼夜节律推荐应用面板 Composable
 * @module composables/climate/useClimateRecommendApplyPanel
 * @description
 *   提供「推荐 → 预览 → 应用」流程的共享逻辑：加载当前激活的家庭模式、
 *   确认应用推荐配置、按成功单位提示应用数量。
 *   被自适应气候、昼夜节律等多个推荐面板复用。
 *   依赖：@/services/api 的 apiPost、@/services/api/home-modes 的模式查询、
 *   @/stores/chrome.store、@/services/notify、@/constants/room-labels。
 */
import { ref, onMounted } from 'vue'
import { applyAdaptiveClimate } from '@/services/api/system'
import { apiPost } from '@/services/api'
import { fetchActiveHomeMode } from '@/services/api/home-modes'
import { useChromeStore } from '@/stores/chrome.store'
import { notifyError } from '@/services/notify'
import { roomLabel } from '@/constants/room-labels'

/**
 * 推荐应用面板的配置选项
 * @property applyPath 应用推荐的 API 路径（非自适应气候时使用）
 * @property useAdaptiveClimateApply 为 true 时走 applyAdaptiveClimate 包装
 * @property successUnit 成功提示中的数量单位文案
 * @property onApplied 应用成功后的回调
 */
interface ClimateRecommendApplyPanelOptions {
  applyPath?: string
  useAdaptiveClimateApply?: boolean
  successUnit: string
  onApplied?: () => void | Promise<void>
}

/**
 * 自适应气候 / 昼夜节律等「推荐 → 预览 → 应用」面板共享逻辑
 * @param options 配置选项
 * @returns busy / showPreview / activeModeName 等响应式状态与方法
 */
export function useClimateRecommendApplyPanel(options: ClimateRecommendApplyPanelOptions) {
  const chrome = useChromeStore()
  /** 应用中标志 */
  const busy = ref(false)
  /** 是否显示预览弹层 */
  const showPreview = ref(false)
  /** 当前激活的家庭模式名称 */
  const activeModeName = ref('')

  /**
   * 加载当前激活的家庭模式名称
   * @sideEffect 失败时清空名称并静默 notifyError
   */
  async function loadActiveMode() {
    try {
      const { data } = await fetchActiveHomeMode()
      activeModeName.value = data?.name || ''
    } catch (e) {
      activeModeName.value = ''
      notifyError(e, '加载失败', { silent: true })
    }
  }

  /**
   * 确认应用推荐配置
   * @sideEffect 成功关闭预览、toast 应用数量并触发 onApplied 回调；
   *             403 提示需要管理员权限，其他错误提示应用失败
   */
  async function confirmApply() {
    busy.value = true
    try {
      const { data } = options.useAdaptiveClimateApply
        ? await applyAdaptiveClimate()
        : await apiPost(options.applyPath || '', {})
      showPreview.value = false
      chrome.notify(`已应用到 ${data?.applied ?? 0} ${options.successUnit}`, 'success')
      await options.onApplied?.()
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status
      chrome.notify(status === 403 ? '需要管理员权限' : '应用失败', 'error')
    } finally {
      busy.value = false
    }
  }

  // 挂载时加载当前激活模式
  onMounted(() => {
    loadActiveMode()
  })

  return {
    busy,
    showPreview,
    activeModeName,
    roomLabel,
    loadActiveMode,
    confirmApply,
  }
}