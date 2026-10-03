/**
 * @file 轻量 REST 查询 Composable
 * @module composables/api/useApiQuery
 * @description
 *   提供统一的 REST 查询状态管理：loading / error / retry / 降级元数据（degraded）。
 *   适用于需要手动触发或简单轮询的场景；复杂 Widget 轮询请使用 useWidgetApiQuery。
 *   依赖：Vue 3 composition API、@/utils/core/error-message 的错误信息提取。
 */
import { ref, shallowRef, type Ref } from 'vue'
import { extractErrorMessage } from '@/utils/core/error-message'

/**
 * API 查询元数据（由后端返回，用于标识降级状态等）
 */
export interface ApiQueryMeta {
  /** Redis 是否就绪 */
  redisReady?: boolean
  /** 是否处于降级模式 */
  degraded?: boolean
  /** 降级原因说明 */
  reason?: string
  [key: string]: unknown
}

/**
 * API 查询状态（useApiQuery 返回值）
 * @template T 数据类型
 */
interface ApiQueryState<T> {
  /** 查询数据（初始为 null） */
  data: Ref<T | null>
  /** 查询元数据 */
  meta: Ref<ApiQueryMeta | null>
  /** 加载中标志 */
  loading: Ref<boolean>
  /** 错误消息（null 表示无错误） */
  error: Ref<string | null>
  /** 是否处于降级模式 */
  degraded: Ref<boolean>
  /** 重试函数 */
  retry: () => Promise<void>
  /** 执行查询函数 */
  execute: () => Promise<void>
}

/** 数据获取器类型：返回 data 与可选 meta */
type ApiQueryFetcher<T> = () => Promise<{ data: T; meta?: ApiQueryMeta | null }>

/**
 * 轻量 REST 查询：统一 loading / error / retry / 降级元数据
 * @param fetcher 数据获取器，需返回 { data, meta? }
 * @param options.immediate 是否在创建时立即执行（默认 true）
 * @param options.initialData 初始数据
 * @returns ApiQueryState 包含响应式状态与 execute / retry 方法
 */
export function useApiQuery<T>(
  fetcher: ApiQueryFetcher<T>,
  options: { immediate?: boolean; initialData?: T | null } = {},
): ApiQueryState<T> {
  // 使用 shallowRef 避免对大对象做深度响应式转换
  const data = shallowRef<T | null>(options.initialData ?? null) as Ref<T | null>
  const meta = shallowRef<ApiQueryMeta | null>(null) as Ref<ApiQueryMeta | null>
  const loading = ref(false)
  const error = ref<string | null>(null)
  const degraded = ref(false)

  // 序号守卫：连续 execute 时丢弃过期响应，避免旧响应覆盖新数据
  let execSeq = 0

  /**
   * 执行查询：调用 fetcher 并更新状态
   * @sideEffect 成功更新 data/meta/degraded；失败设置 error 并标记降级
   */
  async function execute() {
    const seq = ++execSeq
    loading.value = true
    error.value = null
    try {
      const result = await fetcher()
      if (seq !== execSeq) return
      data.value = result.data
      meta.value = result.meta ?? null
      // 降级判定：meta 显式标记 / Redis 未就绪 / 存在 reason
      degraded.value = Boolean(
        result.meta?.degraded || result.meta?.redisReady === false || result.meta?.reason,
      )
    } catch (err) {
      if (seq !== execSeq) return
      error.value = extractErrorMessage(err)
      degraded.value = true
    } finally {
      if (seq === execSeq) loading.value = false
    }
  }

  /** 重试：等同于 execute */
  async function retry() {
    await execute()
  }

  // 默认立即执行一次（immediate !== false 时）
  if (options.immediate !== false) {
    void execute()
  }

  return { data, meta, loading, error, degraded, retry, execute }
}