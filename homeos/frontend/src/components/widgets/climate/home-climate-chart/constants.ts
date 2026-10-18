/**
 * @file constants.ts
 * @module widgets/climate/home-climate-chart
 * @description 家居气候图表常量：温度/湿度系列配色与图表重试上限。
 *              系列颜色按顺序循环分配给多条曲线，最多支持 5 条同类型曲线。
 */
export const TEMP_COLORS = ['#ff5a5f', '#ffb020', '#ffc46a', '#ff8a8e', '#ffd9a0']

/** HUM_COLORS：常量集合，成员语义见定义处。 */
export const HUM_COLORS = ['#59d3c0', '#3ddc97', '#7ff0bd', '#3fb8a6', '#a7b4c2']

/** MAX_CHART_RETRIES：常量，取值语义见定义处。 */
export const MAX_CHART_RETRIES = 12
