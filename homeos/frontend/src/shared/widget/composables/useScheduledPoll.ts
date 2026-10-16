/** 小组件轮询调度组合式函数：走全局调度器，页面隐藏时暂停。 */
import { onMounted, onUnmounted, unref, isRef, watch, type Ref } from 'vue'
import { schedulePoll } from '@/shared/utils/core/poll-scheduler'
import { getWidgetPollInterval, configEpoch } from '@/shared/utils/config/frontend-config'
// 轮询实例自增序号，用于在没有显式 key 时生成唯一 key
let pollInstanceSeq = 0

/** 轮询可选项 */
interface ScheduledPollOptions {
  /** 是否在 onMounted 时立即执行一次回调（默认 true） */
  immediate?: boolean
  /** 页面隐藏时是否暂停（保留给调度器内部使用） */
  pauseWhenHidden?: boolean
  /** 自定义轮询 key，相同 key 会复用调度；未提供时使用组件 uid 或自增序号 */
  key?: string
  /**
   * 小组件轮询键：命中「高级参数 → widgetPollIntervals[key]」时用其毫秒值
   * 覆盖代码内置的 intervalMs（如 'weather' / 'homeClimateChart'）。
   */
  configKey?: string
}

/**
 * 注册一个小组件轮询任务，遵循组件生命周期（挂载时启动、卸载时取消）。
 *
 * @param {() => void} callback  轮询回调
 * @param {number | Ref<number> | (() => number)} intervalMs  轮询间隔（毫秒），支持静态值、ref 或 getter
 * @param {ScheduledPollOptions} [options]  轮询可选项
 * @returns {{ refresh: () => void, restart: () => void }} refresh=手动触发一次回调；restart=重新注册（间隔变化时使用）
 */
export function useScheduledPoll(
  callback: () => void,
  intervalMs: number | Ref<number> | (() => number),
  options: ScheduledPollOptions = {},
) {
  const { immediate = true, key: explicitKey, configKey } = options
  let cancel: (() => void) | null = null
  // 计算 key：优先使用显式 key，否则以模块级自增序号生成，保证同一组件内多次调用也互不冲突
  const pollKey = explicitKey || `poll:${++pollInstanceSeq}`

  /** 解析当前轮询间隔：兼容 number / Ref / getter 三种入参形态 */
  function baseMs() {
    if (typeof intervalMs === 'function') return intervalMs()
    if (isRef(intervalMs)) return unref(intervalMs)
    return intervalMs
  }

  /** 解析最终间隔：configKey 命中高级参数覆写时优先使用配置值 */
  function resolveMs() {
    const base = baseMs()
    return configKey ? getWidgetPollInterval(configKey, base) : base
  }

  /** 注册（或重新注册）当前轮询任务到全局调度器 */
  function register() {
    if (cancel) cancel()
    cancel = schedulePoll(pollKey, callback, resolveMs())
  }

  let active = false
  onMounted(() => {
    // 立即执行策略：仅当 immediate 且页面可见时触发一次，避免在后台标签页浪费资源
    if (immediate && !document.hidden) callback()
    register()
    active = true
  })

  // 高级参数（widgetPollIntervals）热更新后重排定时器，无需刷新页面即可生效
  watch(configEpoch, () => {
    if (active) register()
  })

  onUnmounted(() => {
    active = false
    if (cancel) cancel()
    cancel = null
  })

  return { refresh: callback, restart: register }
}