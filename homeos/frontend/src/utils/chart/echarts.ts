/**
 * ECharts 按需加载入口
 *
 * 替代全量 `import * as echarts from 'echarts'` (~1MB gzip ~300KB)
 * 仅引入项目中实际使用的图表类型和组件，预计减少 60%+ 体积
 *
 * 使用组件清单：
 *  - LineChart (TemperatureChart, SensorTrendChart)
 *  - BarChart (UtilityMeterInfoPopup 水/气/电, CommInfoPopup)
 *  - HeatmapChart (UtilityMeterInfoPopup 水/气/电, CommInfoPopup, DeviceAnalyticsDashboard)
 *  - PieChart (DeviceStatsDashboard, DeviceStateHistoryPanel)
 *  - RadarChart (DeviceAnalyticsPanel)
 *  - GridComponent, TooltipComponent, LegendComponent (所有图表)
 *  - VisualMapComponent (Heatmap)
 *  - DataZoomComponent (部分图表)
 *  - GraphicComponent (TemperatureChart, SensorTrendChart 的 LinearGradient)
 *  - CanvasRenderer (所有图表)
 *
 * 职责：注册 ECharts 按需组件并导出 echarts 实例。
 * 依赖：echarts/core、echarts/charts、echarts/components、echarts/renderers。
 *
 * 分包约定：本模块体积大（echarts vendor），消费方必须用动态 import 引入；
 * 动画选项等轻量配置请从 @/utils/chart/kiosk-animation 静态导入。
 */
import * as echarts from 'echarts/core'
import type { ECharts, EChartsInitOpts } from 'echarts/core'
import { LineChart, BarChart, HeatmapChart, PieChart, RadarChart, GaugeChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  DataZoomComponent,
  GraphicComponent,
  RadarComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  LineChart,
  BarChart,
  HeatmapChart,
  PieChart,
  RadarChart,
  GaugeChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  DataZoomComponent,
  GraphicComponent,
  RadarComponent,
  CanvasRenderer,
])

export default echarts

/**
 * 幂等获取图表实例：容器已有实例时复用，否则新建。
 *
 * ECharts 的 ``init`` 在容器已有实例时会打印
 * ``There is a chart instance already initialized on the dom.`` 并返回既有实例。
 * 因此并发初始化（典型场景：动态 import 期间数据 watch 再次触发渲染，两次调用
 * 都在 await 前通过了 ``if (!chart)`` 判断）会在开发期刷出该告警，
 * 生产构建（``NODE_ENV === 'production'``）下静默。
 *
 * 这里先查 ECharts 自身的 DOM 注册表，命中即复用 —— 与 ``init`` 的既有实例分支
 * 行为完全一致，仅消除告警。所有 ``init`` 调用点应改用本函数。
 *
 * @param dom 图表容器
 * @param theme 主题，默认 undefined
 * @param opts 初始化选项（如显式传入 width / height 以避免测量期告警）
 * @returns 容器上的既有实例，或新建实例
 */
export function getOrInitChart(
  dom: HTMLElement,
  theme?: string | object | null,
  opts?: EChartsInitOpts,
): ECharts {
  return echarts.getInstanceByDom(dom) ?? echarts.init(dom, theme, opts)
}