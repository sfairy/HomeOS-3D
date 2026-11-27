/**
 * `features/energy/composables` 公开面。
 *
 * 这些模块此前被合并成 `composables.ts`（1512 行），
 * 但它们各自职责不同（见各文件头注释），混在一个文件里无法按职责定位。
 * 拆回独立文件后由本桶维持既有 import 说明符不变。
 */
export * from './use-client-power-reporter'
export * from './use-comm-info-popup'
export * from './use-server-energy-history'
export * from './use-utility-meter-popup'
export * from './utility-meter-popup.calendar'
export * from './utility-meter-popup.charts'
export * from './utility-meter-popup.lists'

// ── 家庭温湿度图表的名称归一（features/settings 的图表配置面板复用）──
// 具名而非 `export *`：echarts.ts 会连带引入 `@/kernel/chart`（整条 ECharts 图依赖），
// 整域再导出会让任何引 `@/features/energy` 的模块都被动吃下它。
export { climateEntityBaseName } from './climate/home-climate-chart/echarts'
