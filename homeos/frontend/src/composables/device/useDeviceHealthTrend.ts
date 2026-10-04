/**
 * 设备健康趋势 Composable
 *
 * 模块：设备 / 健康趋势
 * 职责：
 *   - 每天采样一次当前所有实体的健康快照（离线数、低电量数、总数）。
 *   - 将最近 MAX_DAYS（14 天）的快照写入 localStorage，持久化跨会话保留。
 *   - 暴露 trend（历史快照数组）与 current（当前快照）两个响应式状态。
 *
 * 设计说明：
 *   - 该 composable 不发起任何 HTTP 请求，全部依赖 entitiesStore 的派生状态。
 *   - 通过 entitiesStore.derivedEpoch 触发响应式依赖收集，确保 current 随 store 变化更新。
 *
 * 依赖：
 *   - @/stores/entities.store.useEntitiesStore：实体状态来源。
 *   - localStorage（STORAGE_KEY）：持久化历史快照。
 */
import { readLocalStorage, writeLocalStorageJson } from '@/utils/core/local-storage.util'

import { computed, onMounted, ref } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'

// localStorage 中的存储 key
const STORAGE_KEY = 'homeos:device-health-trend'
// 最多保留的天数（窗口大小）
const MAX_DAYS = 14

/**
 * 单日健康快照结构。
 */
interface DeviceHealthSnapshot {
  // 日期 key，格式 YYYY-MM-DD
  day: string
  // 当日离线设备数（state 为 unavailable / unknown）
  offline: number
  // 当日低电量设备数（battery_level <= 20）
  lowBattery: number
  // 当日实体总数
  total: number
}

/**
 * 生成当天的日期 key（YYYY-MM-DD，本地时区）。
 *
 * @returns 形如 "2025-01-31" 的字符串。
 */
function todayKey() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 从 localStorage 读取历史快照。
 *
 * @returns 快照数组；读取或解析失败时返回空数组。
 */
function readTrend(): DeviceHealthSnapshot[] {
  try {
    const raw = readLocalStorage(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as DeviceHealthSnapshot[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * 将快照数组写入 localStorage（仅保留最近 MAX_DAYS 天）。
 *
 * @param rows 待持久化的快照数组。
 */
function writeTrend(rows: DeviceHealthSnapshot[]) {
  try {
    writeLocalStorageJson(STORAGE_KEY, rows.slice(-MAX_DAYS))
  } catch {
    // 容量超限或隐私模式等场景下静默忽略
  }
}

/**
 * 设备健康趋势 Composable。
 *
 * @returns trend（历史快照）/ current（当前快照）/ sampleToday / refresh（等价于 sampleToday）。
 */
export function useDeviceHealthTrend() {
  const entitiesStore = useEntitiesStore()
  // 初始化时立即从 localStorage 读取历史快照
  const trend = ref<DeviceHealthSnapshot[]>(readTrend())

  /**
   * 当前实体的健康快照（实时计算）。
   * 通过访问 entitiesStore.derivedEpoch 显式建立响应式依赖，
   * 一旦 store 中实体状态变化，computed 即自动重算。
   */
  const current = computed(() => {
    // 触碰 derivedEpoch 以建立响应式依赖
    void entitiesStore.derivedEpoch
    const devices = entitiesStore.entities
    const keys = Object.keys(devices)
    let offline = 0
    let lowBattery = 0
    for (const key of keys) {
      const d = devices[key]
      // 不可用 / 未知状态视为离线
      if (d.state === 'unavailable' || d.state === 'unknown') offline++
      const level = d.attributes?.battery_level
      // battery_level 为数值且 <= 20 视为低电量
      if (typeof level === 'number' && level <= 20) lowBattery++
    }
    return { offline, lowBattery, total: keys.length }
  })

  /**
   * 采集当天快照：用最新 current 覆盖同日记录，再截断到 MAX_DAYS 内。
   *
   * 副作用：会写入 localStorage 并更新 trend.value。
   */
  function sampleToday() {
    const day = todayKey()
    const snap = current.value
    // 过滤掉当天已有记录，再追加新快照
    const rows = readTrend().filter((r) => r.day !== day)
    rows.push({ day, ...snap })
    writeTrend(rows)
    trend.value = rows.slice(-MAX_DAYS)
  }

  // 组件挂载时立即采样一次，保证当天数据可用
  onMounted(() => {
    sampleToday()
  })

  return { trend, current, sampleToday, refresh: sampleToday }
}