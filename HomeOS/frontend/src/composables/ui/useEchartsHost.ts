/**
 * @file useEchartsHost.ts
 * @module frontend/src/composables
 *
 * 多图表 ECharts 宿主 composable：收敛各视图手写的
 * charts 字典 + chartDomReady + ensureChart（重试）+ renderCharts 调度 +
 * resize 观察绑定/解绑 + dispose 清理样板。
 *
 * 职责边界：宿主只管实例生命周期与渲染调度；option 构建（数据/样式）留在调用方。
 * echarts 通过动态 import 惰性加载（模块级缓存），保留调用方的分包语义；
 * 动画选项等轻量配置从 @/utils/chart/kiosk-animation 静态导入。
 *
 * 依赖：vue、chart-resize.util（调度与 ResizeObserver）、kiosk-animation（动画开关）。
 */
import { onMounted, onUnmounted, nextTick } from 'vue'
import {
  observeChartResize,
  scheduleEchartsTask,
  cancelScheduledEchartsTask,
} from '@/utils/ui/chart-resize.util'
import type { EChartsCoreOption } from 'echarts/core'
import type * as EchartsModuleNS from '@/utils/chart/echarts'
import { getKioskAnimationOptions } from '@/utils/chart/kiosk-animation'

type EchartsModule = typeof EchartsModuleNS
type ChartInst = ReturnType<EchartsModule['default']['init']>
type KioskAnimationOptions = ReturnType<typeof getKioskAnimationOptions>

/** 容器尺寸为 0 时的最大重试次数（与既有手写宿主一致：12 次双 rAF 重试） */
const DEFAULT_MAX_RETRIES = 12

/** 模块级 echarts 加载缓存：首次渲染时动态 import，之后复用同一实例 */
let echartsPromise: Promise<EchartsModule> | null = null

function loadEchartsModule(): Promise<EchartsModule> {
  echartsPromise ??= import('@/utils/chart/echarts')
  return echartsPromise
}

/** 动画选项快照（echarts 首次加载时读取，语义与调用方在 setup 期快照一致） */
let kioskAnimationOptions: KioskAnimationOptions | null = null

/** 共享主题常量（统一定义于 chart-primitives，此处 re-export 保持既有调用方引用不变） */
export { axisLineStyle, splitLineStyle } from '@/utils/chart/chart-primitives'

/** Y 轴最大值：至少为 1，避免全 0 时图表塌缩 */
export function yMax(values: number[]) {
  return Math.max(...values, 0, 1)
}

/**
 * 判断图表 DOM 是否已就绪（宽高均大于 0）。
 * @param el 图表容器元素
 * @returns 类型谓词，true 表示 DOM 已就绪
 */
function chartDomReady(el: HTMLElement | null): el is HTMLElement {
  if (!el) return false
  return (el.clientWidth || el.offsetWidth) > 0 && (el.clientHeight || el.offsetHeight) > 0
}

/** 单个图表定义 */
interface EchartsHostChartDef {
  /** 图表容器元素 getter（通常传 () => ref.value） */
  el: () => HTMLElement | null
  /** option 构造函数（每次渲染时调用，数据/样式逻辑留在调用方） */
  build: () => EChartsCoreOption
  /** 实例首次创建后回调（用于绑定 click 等事件；实例因 DOM 重建时再次触发） */
  onInit?: (chart: ChartInst) => void
}

/** EchartsHostOptions：类型定义，字段语义见声明。 */
export interface EchartsHostOptions {
  /** 图表注册表：key → 图表定义 */
  charts: Record<string, EchartsHostChartDef>
  /** 容器尺寸为 0 时的最大重试次数，默认 12 */
  maxRetries?: number
  /**
   * 每次全部渲染成功后重绑 resize 观察器。
   * 适用于容器 DOM 会被 v-if 重建的场景（如骨架屏切换），默认 false。
   */
  rebindResizeOnRender?: boolean
  /**
   * resize 观察任务与渲染任务共用同一 owner（历史行为：同帧多次 resize
   * 仅最后一次生效）。默认 false（每个容器独立 owner，与 events/reports 宿主一致）。
   */
  sharedResizeOwner?: boolean
  /** 容器 resize 时若实例尚未创建则调度渲染，默认 true；置 false 保持仅 resize 语义 */
  resizeFallbackRender?: boolean
  /** 全部图表渲染成功后的回调（如统一绑定点击事件） */
  onRendered?: () => void
}

/**
 * 多图表 ECharts 宿主。
 *
 * 内置行为（与既有手写样板逐一对齐）：
 *  - onMounted：nextTick 后绑定 resize 观察并调度首轮渲染；
 *  - 渲染调度：scheduleEchartsTask 双 rAF，容器未就绪时最多重试 maxRetries 次；
 *  - resize：容器尺寸变化时实例已存在则 resize，否则（可选）调度渲染；
 *  - onUnmounted：取消调度任务、解绑观察器并 dispose 全部实例。
 *
 * @param options 图表注册表与行为选项
 * @returns schedule（调度渲染）/ get（取实例）/ getChartBase（主题基座）/
 *   bindResize / unbindResize / disposeAll（手动整体销毁，如骨架屏切换）
 */
export function useEchartsHost(options: EchartsHostOptions) {
  const defs = options.charts
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  /** 调度任务 owner，用于在调度器中唯一标识本实例的任务 */
  const owner = {}
  /** ECharts 实例缓存；null 表示尚未初始化 */
  const charts: Record<string, ChartInst | null> = {}
  /** 各容器 resize 观察停止函数 */
  const stopResize: Record<string, (() => void) | null> = {}
  /** 整体销毁代际：await 期间被销毁的 ensure 直接放弃，避免僵尸实例 */
  let epoch = 0

  /** 获取指定图表实例（未初始化时为 null） */
  function get(key: string): ChartInst | null {
    return charts[key] ?? null
  }

  /**
   * 确保指定图表已初始化并应用 option。
   * DOM 未就绪返回 false（由上层重试）；实例与容器 DOM 脱钩时重建。
   * @param key 图表 key
   * @returns true 表示本次渲染成功
   */
  async function ensureChart(key: string): Promise<boolean> {
    const def = defs[key]
    if (!def) return false
    const el = def.el()
    if (!chartDomReady(el)) return false
    if (charts[key] && charts[key]!.getDom() !== el) {
      charts[key]!.dispose()
      charts[key] = null
    }
    if (!charts[key]) {
      const currentEpoch = epoch
      const mod = await loadEchartsModule()
      if (currentEpoch !== epoch) return false
      const target = def.el()
      if (!chartDomReady(target)) return false
      kioskAnimationOptions ??= getKioskAnimationOptions()
      // 显式传入尺寸，避免测量阶段布局抖动时 ECharts 告警
      const width = target.clientWidth || target.offsetWidth
      const height = target.clientHeight || target.offsetHeight
      const chart = mod.default.init(target, undefined, { width, height })
      charts[key] = chart
      def.onInit?.(chart)
    }
    charts[key]!.setOption(def.build(), true)
    charts[key]!.resize()
    return true
  }

  /**
   * 渲染全部图表；任一未就绪则重试（最多 maxRetries 次）。
   * @param retry 当前重试次数
   */
  async function renderCharts(retry = 0) {
    await nextTick()
    const pending = await Promise.all(Object.keys(defs).map((key) => ensureChart(key)))
    if (pending.every(Boolean)) {
      options.onRendered?.()
      if (options.rebindResizeOnRender) bindResize()
      return
    }
    if (retry < maxRetries) {
      scheduleEchartsTask(owner, () => void renderCharts(retry + 1))
    }
  }

  /** 调度渲染全部图表（重试计数归零，取消同 owner 的待执行任务） */
  function schedule() {
    scheduleEchartsTask(owner, () => void renderCharts(0))
  }

  /** 解绑全部 resize 观察器 */
  function unbindResize() {
    for (const key of Object.keys(stopResize)) {
      stopResize[key]?.()
      stopResize[key] = null
    }
  }

  /** 绑定各容器 resize 观察器（先解绑旧观察） */
  function bindResize() {
    unbindResize()
    for (const key of Object.keys(defs)) {
      const def = defs[key]
      // 每个容器独立持有观察任务，避免 rAF 任务取消渲染重试
      stopResize[key] = observeChartResize(
        def.el(),
        () => {
          const chart = charts[key]
          if (chart) chart.resize()
          else if (options.resizeFallbackRender !== false) schedule()
        },
        options.sharedResizeOwner ? owner : undefined,
      )
    }
  }

  /** 整体销毁：取消调度任务、解绑观察器并 dispose 全部实例 */
  function disposeAll() {
    epoch++
    cancelScheduledEchartsTask(owner)
    unbindResize()
    for (const key of Object.keys(charts)) {
      charts[key]?.dispose()
      charts[key] = null
    }
  }

  /** 图表基础配置（动画 + 透明背景）；仅在渲染期调用（echarts 已加载） */
  function getChartBase() {
    return { ...(kioskAnimationOptions ?? {}), backgroundColor: 'transparent' }
  }

  onMounted(() => {
    nextTick(() => {
      bindResize()
      schedule()
    })
  })

  onUnmounted(disposeAll)

  return { schedule, get, getChartBase, bindResize, unbindResize, disposeAll }
}
