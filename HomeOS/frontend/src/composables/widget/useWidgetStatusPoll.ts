/**
 * Widget 状态轮询组合式函数
 *
 * 所属模块：composables/widget
 * 职责：为各类 widget 的周期性数据拉取提供统一封装，合并「配置解析轮询间隔」与「注册全局调度」两步样板逻辑；
 *      自动从前端配置中读取对应 widget 的间隔设置，注册到全局调度器，并在配置变更时自动重启轮询；
 *      组件卸载时自动取消订阅与配置监听，避免内存泄漏。
 * 入参：
 *   - widgetKey：配置内 widgetPollIntervals 的键名，同时用作调度 key 前缀
 *   - fetchFn：拉取数据的回调函数
 *   - fallbackMs：无配置时的兜底间隔（毫秒），默认 60000
 *   - options：调度选项，支持 immediate、自定义 key 等
 * 返回：refresh 立即刷新、restart 重启轮询、intervalMs 当前生效间隔 getter
 * 内部副作用：挂载时注册 onConfigChange 监听器，卸载时自动清理。
 */
import { onMounted, onUnmounted } from 'vue'
import { getWidgetPollInterval } from '@/composables/widget/useWidgetPollInterval'
import { useScheduledPoll, type ScheduledPollOptions } from '@/composables/widget/useScheduledPoll'
import { onConfigChange } from '@/utils/config/frontend-config'
/**
 * Widget 状态轮询封装：合并「按配置解析轮询间隔」+「注册全局调度轮询」两步样板。
 *
 * 所属模块：widget/composables
 * 职责：为各种 widget 状态轮询场景提供一站式封装，自动从配置中读取间隔、注册全局调度，
 *      并在配置变更时自动重启轮询；卸载时取消订阅。
 * 依赖：
 *   - vue（onMounted / onUnmounted）
 *   - @/composables/widget/useWidgetPollInterval（间隔解析）
 *   - @/composables/widget/useScheduledPoll（全局调度注册）
 *   - @/utils/config/frontend-config（配置变更订阅）
 *
 * @param {string} widgetKey  配置内 widgetPollIntervals 的键，同时用作调度 key 前缀
 * @param {() => void} fetchFn 拉取数据的回调
 * @param {number} fallbackMs  无配置时的兜底间隔
 * @param {{ immediate?: boolean, key?: string }} [options]
 * @returns {{ refresh: () => void, restart: () => void, get intervalMs(): number }}
 */
export function useWidgetStatusPoll(
  widgetKey: string,
  fetchFn: () => void,
  fallbackMs = 60000,
  options: ScheduledPollOptions = {},
) {
  // 解析当前生效的轮询间隔（响应配置变更后会重新计算）
  const resolveInterval = () => getWidgetPollInterval(widgetKey, fallbackMs)
  // 调度 key：优先使用 options.key，否则以 `widget:${widgetKey}` 作为前缀
  const key = options.key || `widget:${widgetKey}`
  const handle = useScheduledPoll(fetchFn, resolveInterval, { ...options, key })
  let cfgUnsub: (() => void) | null = null
  onMounted(() => {
    // 监听前端配置变更：间隔被调整后需要重启轮询以应用新值
    cfgUnsub = onConfigChange(() => handle.restart())
  })
  onUnmounted(() => cfgUnsub?.())
  return {
    ...handle,
    /** 当前生效的轮询间隔（毫秒） */
    get intervalMs() {
      return resolveInterval()
    },
  }
}