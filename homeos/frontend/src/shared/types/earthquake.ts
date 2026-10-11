/**
 * 地震预警配置与告警数据结构。
 * 依赖：@homeos/shared（EEW 倒计时选项、全球地震源/周期/事件类型）。
 */
import {
  EEW_COUNTDOWN_LEAD_OPTIONS,
  type EewCountdownLeadSec,
  eewCountdownLeadLabel,
  type EarthquakeAlertPayload,
  type GlobalEarthquakePeriod,
  type GlobalEarthquakeSource,
} from '@homeos/shared'

export type { EarthquakeAlertPayload, GlobalEarthquakePeriod, GlobalEarthquakeSource }
export { EEW_COUNTDOWN_LEAD_OPTIONS, eewCountdownLeadLabel }

/** 地震预警配置（与后端 earthquake 分区对齐） */
export interface EarthquakeConfig {
  enabled: boolean // 是否启用地震预警
  latitude: string // 纬度（字符串形式，保留精度）
  longitude: string // 经度（字符串形式，保留精度）
  minMagnitude: number // 最小震级阈值（低于此值不告警）
  maxDistance: number // 最大震中距离（公里）
  minLocalIntensity: number // 最小本地烈度阈值
  enableTts: boolean // 是否启用 TTS 语音播报
  /** 模拟演练全屏预警显示阈值：60/30 秒倒计时，或 0=横波已到达（真实预警由服务器推送，不受此项影响） */
  countdownLeadSec: EewCountdownLeadSec
}

/** 全球地震数据源选项（含中文标签） */
export const GLOBAL_EARTHQUAKE_SOURCES: { id: GlobalEarthquakeSource; label: string }[] = [
  { id: 'cenc', label: '中国地震台网 (CENC)' },
  { id: 'usgs', label: 'USGS 全球' },
]

/** 全球地震时间范围选项（含中文标签） */
export const GLOBAL_EARTHQUAKE_PERIODS: { id: GlobalEarthquakePeriod; label: string }[] = [
  { id: 'hour', label: '近 1 小时' },
  { id: 'day', label: '近 24 小时' },
  { id: 'week', label: '近 7 天' },
  { id: 'month', label: '近 30 天' },
]

/** 本地 EEW 数据源短标签（卡片徽章 / 筛选） */
const EEW_SOURCE_LABELS: Record<string, string> = {
  wolfx: 'Wolfx',
  sc_eew: '四川速报',
  cenc_eew: 'CENC EEW',
  cenc: 'CENC 震情',
  usgs: 'USGS',
  test: '演练',
}

/** 本地预警 Tab · 数据源筛选 */
export const LOCAL_EEW_SOURCE_FILTERS = [
  { id: 'all', label: '全部来源' },
  { id: 'wolfx', label: 'Wolfx' },
  { id: 'sc_eew', label: '四川速报' },
  { id: 'cenc_eew', label: 'CENC EEW' },
  { id: 'cenc', label: 'CENC 震情' },
  { id: 'usgs', label: 'USGS' },
  { id: 'test', label: '演练' },
] as const

/** 本地预警 Tab · 预警形态筛选 */
export const LOCAL_EEW_KIND_FILTERS = [
  { id: 'all', label: '全部类型' },
  { id: 'early', label: '预警' },
  { id: 'confirmation', label: '确认通报' },
] as const

export function eewSourceLabel(source?: string | null): string {
  if (!source) return ''
  return EEW_SOURCE_LABELS[source] || source
}

export function eewAlertKindLabel(kind?: string | null): string {
  if (kind === 'confirmation') return '确认通报'
  if (kind === 'early') return '预警'
  return ''
}

/** 城市预设（含经纬度，供快速选择监测点） */
export const EEW_CITY_PRESETS = [
  { name: '北京', lat: 39.9042, lon: 116.4074 },
  { name: '上海', lat: 31.2304, lon: 121.4737 },
  { name: '广州', lat: 23.1291, lon: 113.2644 },
  { name: '深圳', lat: 22.5431, lon: 114.0579 },
  { name: '成都', lat: 30.5728, lon: 104.0668 },
  { name: '重庆', lat: 29.4316, lon: 106.9123 },
  { name: '昆明', lat: 25.0389, lon: 102.7183 },
  { name: '乌鲁木齐', lat: 43.8256, lon: 87.6168 },
  { name: '杭州', lat: 30.2741, lon: 120.1551 },
  { name: '武汉', lat: 30.5928, lon: 114.3055 },
  { name: '西安', lat: 34.3416, lon: 108.9398 },
  { name: '台北', lat: 25.033, lon: 121.5654 },
] as const

/** 最小震级可选值列表 */
export const EEW_MAGNITUDE_OPTIONS = [2, 3, 4, 5] as const
/** 最大震中距离可选值列表（公里） */
export const EEW_DISTANCE_OPTIONS = [100, 200, 300, 500, 1000, 2000] as const
/** 最小本地烈度可选值列表（1≈几乎不限制，仍保留公式下限） */
export const EEW_INTENSITY_OPTIONS = [1, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6] as const

/** 创建默认地震预警配置（首次启用时使用） */
export function createDefaultEarthquakeConfig(): EarthquakeConfig {
  return {
    enabled: false,
    latitude: '',
    longitude: '',
    minMagnitude: 3,
    maxDistance: 500,
    minLocalIntensity: 2,
    enableTts: true,
    countdownLeadSec: 60,
  }
}