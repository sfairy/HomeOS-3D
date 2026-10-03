/**
 * @file useListPageQuery.ts
 * @module composables/ui
 * @description 列表页通用加载态 composable：封装 loading / error / items 与统一加载方法。
 *
 * 职责：
 * - 调用 GET 拉取列表数据，统一解析数组 / paginated items / data 包装三种响应形态；
 * - 失败时不伪装为空列表，而是把错误文案写入 error，由调用方决定 UI；
 * - 支持前台静默加载（background）模式，已有数据时不显示 loading。
 *
 * 依赖：
 * - vue（ref）
 * - @/services/api/index（apiGet）
 * - @/utils/core/logger（失败日志）
 * - @/utils/core/error-message（错误文案兜底）
 */
import { ref } from 'vue'
import { apiGet } from '@/services/api/index'
import { logger } from '@/utils/core/logger'
import { getApiErrorMessage } from '@/utils/core/error-message'

/**
 * 统一解析列表 API 响应（数组 / paginated items / data 包装）。
 *
 * @param data 原始响应体
 * @returns 解析后的列表数组（无法识别时返回空数组）
 */
function normalizeListResponse<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object') {
    const row = data as { items?: T[]; data?: T[] }
    if (Array.isArray(row.items)) return row.items
    if (Array.isArray(row.data)) return row.data
  }
  return []
}

/**
 * 列表页通用加载态：loading / error / items，失败时不伪装为空列表。
 *
 * @param defaultErrorMsg 默认错误文案（默认"加载失败"）
 * @returns items 列表项；loading 加载中标志；error 错误文案；load 加载方法
 */
export function useListPageQuery<T = Record<string, unknown>>(defaultErrorMsg = '加载失败') {
  const items = ref<T[]>([]) as { value: T[] }
  const loading = ref(false)
  const error = ref('')

  /**
   * 加载列表数据。
   *
   * @param url 列表 API URL
   * @param options.background 是否静默加载（默认：已有数据时为 true，首次为 false）
   */
  async function load(url: string, options?: { background?: boolean }) {
    const background = options?.background ?? items.value.length > 0
    // 非静默模式才显示 loading，避免已有数据时整页闪烁
    if (!background) loading.value = true
    error.value = ''
    try {
      const { data } = await apiGet(url)
      items.value = normalizeListResponse<T>(data)
    } catch (e) {
      logger.warn('列表加载失败', { url, error: e })
      error.value = getApiErrorMessage(e, defaultErrorMsg)
      // 失败时清空列表，避免残留过期数据
      items.value = []
    } finally {
      loading.value = false
    }
  }

  return { items, loading, error, load }
}
