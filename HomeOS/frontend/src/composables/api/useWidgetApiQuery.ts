/**
 * @file Widget 场景 REST 查询 Composable
 * @module composables/api/useWidgetApiQuery
 * @description
 *   在 useApiQuery 基础上增加 Widget 专用能力：定时轮询 + 面板可见时刷新。
 *   适用于仪表盘 Widget 的数据拉取，自动处理挂载即拉取、v-if 切入刷新、轮询调度。
 *   依赖：useApiQuery、useWidgetStatusPoll（轮询调度器）。
 */
import { onMounted } from 'vue'
import { useApiQuery, type ApiQueryMeta } from '@/composables/api/useApiQuery'
import { useWidgetStatusPoll } from '@/composables/widget/useWidgetStatusPoll'

/** Widget 数据获取器类型 */
type WidgetApiFetcher<T> = () => Promise<{ data: T; meta?: ApiQueryMeta | null }>

/**
 * Widget 场景：useApiQuery + 轮询 + 面板可见时刷新
 * @param widgetKey Widget 标识（用作默认轮询 key）
 * @param fetcher 数据获取器
 * @param pollIntervalMs 轮询间隔（毫秒），默认 60 秒
 * @param options.immediate 是否挂载即拉取（默认 true）
 * @param options.initialData 初始数据
 * @param options.pollKey 轮询 key（默认使用 widgetKey）
 * @param options.panelVisible 面板可见性判断函数，返回 false 时跳过刷新
 * @returns ApiQueryState 查询状态
 */
export function useWidgetApiQuery<T>(
  widgetKey: string,
  fetcher: WidgetApiFetcher<T>,
  pollIntervalMs = 60_000,
  options: {
    immediate?: boolean
    initialData?: T | null
    pollKey?: string
    panelVisible?: () => boolean
  } = {},
) {
  // 内部 immediate 关闭，由本 composable 自行控制挂载时序
  const query = useApiQuery(fetcher, {
    immediate: false,
    initialData: options.initialData ?? null,
  })

  /**
   * 面板可见时刷新数据
   * @sideEffect panelVisible 返回 false 时跳过
   */
  async function refreshIfVisible() {
    if (options.panelVisible && !options.panelVisible()) return
    await query.execute()
  }

  // 默认挂载即拉取；immediate:false 时仅依赖外部/轮询触发。
  // v-if 重新进入会重新走 setup → onMounted 必然触发，无需再叠加微任务（否则挂载即双发请求）
  if (options.immediate !== false) {
    onMounted(() => {
      void refreshIfVisible()
    })
  }

  // 注册轮询：按 pollIntervalMs 间隔定时刷新
  useWidgetStatusPoll(options.pollKey || widgetKey, () => refreshIfVisible(), pollIntervalMs, {
    key: `widget:${widgetKey}`,
    immediate: false,
  })

  return query
}