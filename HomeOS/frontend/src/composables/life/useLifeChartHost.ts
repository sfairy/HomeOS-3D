/**
 * 各独立 Hub / 模块页通用的 ECharts 挂载：init / resize / dispose，
 * 内置尺寸为 0 时的重试与 ResizeObserver 绑定。
 *
 * 所属模块：生活（life）/ Hub 通用图表宿主。
 * 职责：在指定 DOM 元素上初始化 ECharts 实例，监听依赖变化重绘，监听容器尺寸变化 resize，
 *   并在尺寸为 0 时通过调度器重试，组件卸载时 dispose。
 *
 * 依赖：vue、echarts（动态 import）、chart-resize.util。
 */
import { onMounted, onUnmounted, watch, nextTick, type Ref, type WatchSource } from 'vue'
import type * as EchartsModuleNS from '@/utils/chart/echarts'
import {
  observeChartResize,
  scheduleEchartsTask,
  cancelScheduledEchartsTask,
} from '@/utils/ui/chart-resize.util'

type EchartsModule = typeof EchartsModuleNS
type ChartInst = ReturnType<EchartsModule['default']['init']>

/**
 * Hub 通用图表挂载 composable。
 *
 * 调用场景：各 Hub / 模块页面的 ECharts 图表组件中调用，传入容器 ref 与 option 构造函数。
 *
 * @param elRef 图表容器 DOM 引用
 * @param buildOption 构建 ECharts option 的函数（每次重绘时调用）
 * @param deps 触发重绘的依赖源数组
 * @returns schedule（手动触发重绘调度）
 */
export function useHubChart(
  elRef: Ref<HTMLElement | null>,
  buildOption: () => Record<string, unknown>,
  deps: WatchSource[],
) {
  /** 调度任务 owner，用于在调度器中唯一标识本实例的任务 */
  const owner = {}
  /** ECharts 实例（惰性创建） */
  let chart: ChartInst | null = null
  /** 尺寸监听卸载函数 */
  let stopResize: (() => void) | null = null

  /**
   * 渲染图表：等待 DOM 更新后初始化/更新 option 并 resize。
   * @param retry 当前重试次数（容器尺寸为 0 时递增重试，最多 12 次）
   */
  async function render(retry = 0) {
    await nextTick()
    const el = elRef.value
    // 容器尚未布局（宽高为 0）：通过调度器延迟重试
    if (!el || el.clientWidth <= 0 || el.clientHeight <= 0) {
      if (retry < 12) scheduleEchartsTask(owner, () => render(retry + 1))
      return
    }
    if (!chart) chart = (await import('@/utils/chart/echarts')).default.init(el)
    chart.setOption(buildOption(), true)
    chart.resize()
  }

  /** 调度一次渲染（取消前一次同 owner 的待执行任务） */
  function schedule() {
    scheduleEchartsTask(owner, () => render(0))
  }

  /**
   * 绑定容器尺寸变化监听。
   * @param el 容器元素
   */
  function bindResize(el: HTMLElement | null | undefined) {
    stopResize?.()
    stopResize = null
    if (el) {
      // 容器从隐藏/0 尺寸变为可见时，若尚未 init 则补一次渲染
      stopResize = observeChartResize(el, () => {
        if (!chart) schedule()
        else chart.resize()
      })
    }
  }

  onMounted(() => {
    schedule()
    nextTick(() => bindResize(elRef.value))
  })

  onUnmounted(() => {
    cancelScheduledEchartsTask(owner)
    stopResize?.()
    chart?.dispose()
    chart = null
  })

  // 依赖变化时调度重绘
  watch(deps, () => schedule(), { deep: true })
  // 容器引用变化时重新绑定 resize 并触发重绘
  watch(elRef, (el) => {
    bindResize(el)
    if (el) schedule()
  })

  return { schedule }
}
