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