/**
 * @file 环境健康面板 Composable
 * @module composables/climate/useEnvironmentHealthPanel
 * @description
 *   环境健康面板的核心逻辑：聚合环境健康数据（房间配置、传感器映射、HA 区域）、
 *   计算 IAQ 与健康评分、构建房间展示列表与风险标识，并提供轮询刷新能力。
 *   包含总览 / 生活 / 舒适 / 趋势 / 房间 / 节律六个 Hub 标签。
 *   依赖：entities.store、@/services/api/system、env-sensor-map.internals、
 *   useWidgetStatusPoll（轮询）、useEnvIaq（IAQ 计算）、@/utils/climate/env-score.util。
 */
import { ref, computed, watch } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { fetchEnvHealth } from '@/services/api/system'
import { buildEnvRoomDisplayList } from '@/composables/settings/env-sensor-map.internals'
import { useWidgetStatusPoll } from '@/composables/widget/useWidgetStatusPoll'
import { notifyError } from '@/services/notify'
import { fetchEnvIaq } from '@/composables/climate/useEnvIaq'
import {
  iaqPollutionColor,
  iaqToHealthScore,
  healthScoreColor,
  healthScoreLabel,
  buildEnvMetricDisplayItems,
  type EnvSensorMapLike,
  type EnvIaqResult,
} from '@/utils/climate/env-score.util'

/** 环境健康 Hub 标签页配置（生活 = 天启生活指数） */
export const ENV_HEALTH_HUB_TABS = [
  { key: 'overview', label: '总览' },
  { key: 'life', label: '生活' },
  { key: 'comfort', label: '舒适' },
  { key: 'trend', label: '趋势' },
  { key: 'rooms', label: '房间' },
  { key: 'circadian', label: '节律' },
]

/**
 * 风险等级文案转换
 * @param risk 风险标识（safe / Lv1* / Lv2* / Lv3*）
 * @returns 友好的中文风险文案
 */
export function riskLabel(risk: string | undefined) {
  if (!risk || risk === 'safe') return '安全'
  if (risk.startsWith('Lv3')) return '高风险'
  if (risk.startsWith('Lv2')) return '中风险'
  if (risk.startsWith('Lv1')) return '注意'
  return risk
}

/**
 * 风险标签样式类名
 * @param risk 风险标识
 * @returns 对应的 CSS 类名（危险 / 警告 / 信息 / 空）
 */
export function roomTagClass(risk: string | undefined) {
  if (!risk || risk === 'safe') return ''
  if (risk.startsWith('Lv3')) return 'eh-tag--danger'
  if (risk.startsWith('Lv2')) return 'eh-tag--warn'
  return 'eh-tag--info'
}

/**
 * 环境健康面板 Composable
 * @param props.config 面板配置
 * @param props.defaultTab 默认标签页
 * @param props.panelVisible 面板可见性（false 时跳过刷新）
 * @param props.pollKey 轮询 key，避免与其他面板共用轮询互相取消
 * @returns 加载状态、IAQ 结果、健康评分、房间列表等响应式数据
 */
export function useEnvironmentHealthPanel(props: {
  config?: Record<string, unknown>
  defaultTab?: string
  panelVisible?: boolean
  /** 避免生活中心与环境面板共用同一 poll key 互相取消 */
  pollKey?: string
}) {
  const entitiesStore = useEntitiesStore()

  /** 数据加载中标志 */
  const loading = ref(true)
  /** 加载错误消息 */
  const loadError = ref('')
  /** 环境房间配置（来自后端） */
  const envRooms = ref<Record<string, unknown>>({})
  /** 环境传感器映射配置 */
  const envSensorMap = ref<Record<string, unknown>>({})
  /** HA 区域列表 */
  const haAreas = ref<Array<{ id: string; name: string }>>([])
  /** IAQ 计算结果 */
  const iaqResult = ref<EnvIaqResult | null>(null)
  /** IAQ 加载错误消息 */
  const iaqLoadError = ref('')
  let fetchGen = 0

  /** IAQ 污染指数（0-100，越高越差） */
  const iaqScore = computed(() => iaqResult.value?.iaq ?? 0)
  /** 健康评分（由 IAQ 转换，无数据时显示 '--'） */
  const healthScore = computed(() =>
    iaqResult.value?.iaq != null ? iaqToHealthScore(iaqScore.value) : '--',
  )
  /** 健康评分对应颜色 */
  const healthColor = computed(() =>
    typeof healthScore.value === 'number' ? healthScoreColor(healthScore.value) : '#8E8E93',
  )
  /** 健康评分文案 */
  const healthLabel = computed(() =>
    typeof healthScore.value === 'number' ? healthScoreLabel(healthScore.value) : '--',
  )

  /** IAQ 污染颜色 */
  const iaqColor = computed(() => iaqPollutionColor(iaqScore.value))

  /** 健康等级颜色样式类（综合风险房间与 IAQ 分数） */
  const healthGradeColor = computed(() => {
    if (riskRooms.value.length > 0) return 'text-red-400'
    if (iaqScore.value <= 20) return 'text-emerald-400'
    if (iaqScore.value <= 40) return 'text-amber-400'
    if (iaqScore.value > 40) return 'text-red-400'
    return 'text-gray-400'
  })

  /** IAQ 详情展示项列表 */
  const iaqDetailItems = computed(() => buildEnvMetricDisplayItems(iaqResult.value))

  /** 房间展示列表（含配置状态与风险标识） */
  const roomList = computed(() =>
    buildEnvRoomDisplayList(envRooms.value, envSensorMap.value, haAreas.value),
  )
  /** 未配置传感器的房间列表 */
  const unconfiguredRooms = computed(() => roomList.value.filter((r) => !r.configured))
  /** 存在风险的房间列表 */
  const riskRooms = computed(() => roomList.value.filter((r) => r.risk && r.risk !== 'safe'))
  /**
   * 拉取 IAQ 数据（带 TTL 缓存）
   * @param ttlMs 缓存有效期（毫秒）
   * @sideEffect 成功更新 iaqResult；失败设置 iaqLoadError；无传感器时清空
   */
  async function fetchIaqData(ttlMs: number) {
    iaqLoadError.value = ''
    const outcome = await fetchEnvIaq(entitiesStore.entities, ttlMs, envSensorMap.value as EnvSensorMapLike)
    if (outcome.status === 'ok') {
      iaqResult.value = outcome.data
    } else if (outcome.status === 'error') {
      iaqResult.value = null
      iaqLoadError.value = outcome.message
    } else {
      iaqResult.value = null
    }
  }

  /**
   * 拉取环境健康数据（房间配置、传感器映射、HA 区域）并触发 IAQ 计算
   * @sideEffect 面板不可见时跳过；失败设置 loadError 并静默 notifyError
   */
  async function fetchData() {
    if (props.panelVisible === false) return
    const gen = ++fetchGen
    loadError.value = ''
    const hadData =
      iaqResult.value != null || Object.keys(envRooms.value).length > 0
    try {
      const healthRes = await fetchEnvHealth()
      if (gen !== fetchGen) return

      if (healthRes?.data) {
        envRooms.value = healthRes.data.rooms || {}
        envSensorMap.value = healthRes.data.sensorMap || {}
        haAreas.value = Array.isArray(healthRes.data.haAreas) ? healthRes.data.haAreas : []
      }

      await fetchIaqData(60_000)
      if (gen !== fetchGen) return
    } catch (e) {
      if (gen !== fetchGen) return
      loadError.value = '环境健康数据加载失败'
      notifyError(e, '加载失败', { silent: hadData })
    } finally {
      if (gen === fetchGen) loading.value = false
    }
  }

  // 注册轮询：每 60 秒刷新一次环境健康数据
  const { refresh } = useWidgetStatusPoll('environmentHealth', fetchData, 60_000, {
    key: props.pollKey || 'widget:environmentHealth',
    immediate: false,
  })

  // 面板可见性变化时触发刷新
  watch(
    () => props.panelVisible,
    (visible) => {
      if (visible) refresh()
    },
    { immediate: true },
  )

  return {
    loading,
    loadError,
    refresh,
    iaqResult,
    iaqLoadError,
    iaqScore,
    healthScore,
    healthColor,
    healthLabel,
    iaqColor,
    healthGradeColor,
    iaqDetailItems,
    roomList,
    unconfiguredRooms,
    riskRooms,
  }
}