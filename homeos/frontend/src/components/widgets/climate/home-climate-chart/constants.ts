/**
 * @file constants.ts
 * @module widgets/climate/home-climate-chart
 * @description 家居气候图表常量：温度/湿度系列配色与图表重试上限。
 *              系列颜色按顺序循环分配给多条曲线，最多支持 5 条同类型曲线。
 */
export const TEMP_COLORS = ['#FF6B6B', '#FF9F0A', '#FF375F', '#FF6482', '#FFD60A']

/** HUM_COLORS：常量集合，成员语义见定义处。 */
export const HUM_COLORS = ['#0A84FF', '#66D4CF', '#5AC8FA', '#32ADE6', '#64D2FF']

/** MAX_CHART_RETRIES：常量，取值语义见定义处。 */
export const MAX_CHART_RETRIES = 12
