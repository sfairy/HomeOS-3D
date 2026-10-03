/**
 * 设备页图表说明文案（统一维护，便于理解曲线含义）
 *
 * 所属模块：设备分析 / 图表文案
 * 职责：集中维护设备页各类图表的标题与说明文字，供组件直接引用。
 * 依赖：无外部依赖，纯常量 + tooltip 格式化函数。
 */
export const DEVICE_CHART_COPY = {
  usageTrend: {
    title: '每日使用趋势',
    desc: '柱状图 = 当天开关/切换次数；折线 = 当天累计开启时长（分钟）。适用于灯、开关等可控实体。',
  },
  usageHourly: {
    title: '一天内活跃时段',
    desc: '将所选周期内的事件按「小时」累加，反映设备常在哪些时段被使用（非单日曲线）。',
  },
  usageRadar: {
    title: '与同域设备对比',
    desc: '雷达三维：切换次数、运行时长、事件数。蓝区为本设备，紫区为同域实体平均值。',
  },
  historyTrend: {
    title: '状态变更轨迹',
    desc: '纵轴为状态类别（非数值高低），横轴为时间。每个点表示一次状态或属性变更。',
  },
  globalTrend: {
    title: '全局使用趋势',
    desc: '全屋可控实体的每日切换次数（左轴）与运行总时长（右轴，分钟）。',
  },
  domainPie: {
    title: '域使用分布',
    desc: '按实体域统计切换次数占比，点击扇区可筛选对应域。',
  },
  activityHeatmap: {
    title: '活跃热力图',
    desc: '行 = 设备，列 = 日期，颜色越深表示当天切换越频繁。点击格子可定位设备。',
  },
  activityRank: {
    title: '设备活跃排行',
    desc: '按切换次数排序，反映近期最常被操作的实体。',
  },
  healthTrend: {
    title: '健康趋势',
    desc: '基于浏览器本地每日快照：离线实体数与低电量实体数变化。',
  },
  eventsByDomain: {
    title: '事件按域分布',
    desc: '所选周期内状态/属性变更事件，按实体域汇总。',
  },
  statusPie: {
    title: '在线状态',
    desc: '当前已加载实体中，在线 vs 离线（unavailable/unknown）占比。',
  },
  domainCountPie: {
    title: '实体域占比',
    desc: '当前已加载实体按域（light、sensor 等）的数量分布。',
  },
} as const

/**
 * 双轴折线/柱线组合图 tooltip 格式化。
 *
 * @param params ECharts tooltip 回调参数（单个或数组）
 * @param series 各系列元信息（name + unit），用于匹配并拼接单位
 * @returns HTML 字符串：表头（axisValue）+ 各系列名值与单位
 */
export function formatDualMetricTooltip(
  params: unknown,
  series: Array<{ name: string; unit: string }>,
): string {
  const items = Array.isArray(params) ? params : [params]
  if (!items.length) return ''
  const header = String((items[0] as { axisValue?: string }).axisValue ?? '')
  const lines = items.map((raw) => {
    const item = raw as { seriesName?: string; value?: number | string; marker?: string }
    const idx = series.findIndex((s) => s.name === item.seriesName)
    const unit = idx >= 0 ? series[idx].unit : ''
    const val = item.value ?? '—'
    return `${item.marker ?? ''}${item.seriesName ?? ''}：<b>${val}${unit ? ` ${unit}` : ''}</b>`
  })
  return `<div style="font-size:var(--premium-fs-micro);color:rgba(255,255,255,0.55);margin-bottom:6px">${header}</div>${lines.join('<br/>')}`
}

/**
 * 时段分布 tooltip 格式化。
 *
 * @param hour 起始小时（0–23）
 * @param count 该时段累计事件数
 * @param totalHours 统计窗口总小时数（用于推算天数）
 * @returns HTML 字符串：天数提示 + 时段区间 + 事件次数 + 说明
 */
export function formatHourlyBucketTooltip(hour: number, count: number, totalHours: number): string {
  const next = (hour + 1) % 24
  return [
    `<div style="font-size:var(--premium-fs-micro);color:rgba(255,255,255,0.55);margin-bottom:4px">近 ${totalHours / 24} 天累计</div>`,
    `<div>${String(hour).padStart(2, '0')}:00 – ${String(next).padStart(2, '0')}:00</div>`,
    `<div>事件 <b>${count}</b> 次</div>`,
    '<div style="font-size:var(--premium-fs-micro);color:var(--hos-text-secondary);margin-top:4px">反映该时段的使用习惯</div>',
  ].join('')
}

/**
 * 热力图 tooltip 格式化。
 *
 * @param dayLabel 日期标签
 * @param deviceName 设备名
 * @param count 切换次数
 * @returns HTML 字符串：日期 + 设备名 + 切换次数
 */
export function formatHeatmapTooltip(dayLabel: string, deviceName: string, count: number): string {
  return [
    `<div style="font-size:var(--premium-fs-micro);color:rgba(255,255,255,0.55);margin-bottom:4px">${dayLabel}</div>`,
    `<div>${deviceName}</div>`,
    `<div>切换 <b>${count}</b> 次</div>`,
  ].join('')
}