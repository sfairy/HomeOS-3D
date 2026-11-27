import { ref, computed, type Ref, type Component } from 'vue'
import { type DeviceGroupEntitiesStoreLike, resolveDeviceGroupEntityIds, type DeviceGroupUiStoreLike, computeOfflineCriticalSet, groupOfflineByDevice, BATTERY_LOW_THRESHOLD, resolveBatteryLevel } from '@/domain/entity/model/utils/device-group'
import { type HaEntityState } from '@/kernel/types/entity'
import { getApiErrorMessage } from '@/kernel/utils/core/index'
import { Settings, ThermometerSnowflake, Droplets, Fan, Flame, Power, Sun, Plug, Bell, Camera, Lock, Thermometer, Music, AlertTriangle } from '@lucide/vue'
import { climateHasDualSetpoint } from '@/domain/entity/model/utils/control/climate-control-core'
import { resolveTemperatureUnit } from '@/domain/entity/model/utils/temperature-unit.util'
import { entityDomainColor } from '@/kernel/constants/index'
import { getEntityDomain } from '@homeos/shared'
import { formatRelativeFromNow } from '@/kernel/utils/format'

/** - 对设备分组中的实体集合执行批量开/关、批量温控关机等操作。 */

/** 批量执行结果项：success 标识单条是否成功，entity_id 用于重试定位。 */
interface BatchExecResultItem {
  entity_id: string
  success: boolean
  error?: string
}

/** 批量执行结果汇总：供 DeviceGroupActions 展示 executed/total/service 与失败明细。 */
interface BatchExecResult {
  /** 是否全部成功 */
  success: boolean
  /** 成功条数 */
  executed: number
  /** 总条数 */
  total: number
  /** 本次批量调用的服务名（展示用） */
  service: string
  /** 逐条执行结果 */
  results: BatchExecResultItem[]
}

/** 批量调用 payload：记录 domain/service/serviceData 供重试复用。 */
interface BatchPayload {
  domain: string
  service: string
  serviceData?: Record<string, unknown>
}

/**
 * DeviceGroupModal 批量执行与重试。
 *
 * @param entityIds 当前分组涉及的实体 ID 列表 ref。
 * @param entitiesStore 实体 store（需提供 callService 与 entities 映射）。
 * @returns 批量执行状态、失败项计算属性、批量开关与重试方法。
 */
export function useDeviceGroupBatch(
  entityIds: Ref<string[]>,
  entitiesStore: DeviceGroupEntitiesStoreLike & {
    callService: NonNullable<DeviceGroupEntitiesStoreLike['callService']>
    entities: Record<string, HaEntityState | undefined>
  },
) {
  /** 是否正在执行批量操作（用于禁用按钮与 loading 态）。 */
  const batchExecuting = ref(false)
  /** 最近一次批量执行的结果（含每条 success/entity_id）。 */
  const batchExecResult = ref<BatchExecResult | null>(null)
  /** 最近一次批量调用的 payload，供 retryFailed 复用。 */
  const lastBatchPayload = ref<BatchPayload | null>(null)
  /** 失败项列表：从 batchExecResult 中过滤出 success 为 false 的条目。 */
  const failedExecItems = computed(() => (batchExecResult.value?.results || []).filter((r) => !r.success))

  /**
   * 执行一组批量调用并把完整结果写入 batchExecResult（成功数/总数/服务名/逐条 success+error）。
   * 所有批量入口统一走此函数，保证 DeviceGroupActions 能拿到 executed/total/service 字段。
   * @param service 服务名（展示用）
   * @param calls 每条调用（含 entity_id 与延迟执行的闭包）
   */
  async function runBatch(
    service: string,
    calls: Array<{ entity_id: string; call: () => Promise<unknown> }>,
  ): Promise<void> {
    const settled = await Promise.allSettled(calls.map((c) => c.call()))
    const results: BatchExecResultItem[] = settled.map((r, i) => {
      if (r.status === 'fulfilled') {
        return { entity_id: calls[i].entity_id, success: true }
      }
      const reason = r.reason
      return {
        entity_id: calls[i].entity_id,
        success: false,
        error: getApiErrorMessage(reason, reason instanceof Error ? reason.message : '失败'),
      }
    })
    const executed = results.filter((r) => r.success).length
    batchExecResult.value = {
      success: executed === results.length,
      executed,
      total: results.length,
      service,
      results,
    }
  }

  /**
   * 取当前分组中处于开机状态的 climate 实体 ID。
   * state 为空或 'off' 视为非活动，不参与批量关机。
   * @returns 活动的 climate entity_id 列表。
   */
  function climateActiveIds() {
    return entityIds.value.filter((eid) => {
      const state = entitiesStore.entities[eid]?.state
      return state && state !== 'off'
    })
  }

  /**
   * 取当前分组中处于关机状态的 climate 实体 ID。
   * state 为空或 'off' 视为可开机目标；unavailable/unknown 不参与批量开机。
   */
  function climateOffIds() {
    return entityIds.value.filter((eid) => {
      const state = String(entitiesStore.entities[eid]?.state || '').toLowerCase()
      return !state || state === 'off'
    })
  }

  /**
   * 为 climate 实体选择开机 HVAC 模式：优先 cool / heat / heat_cool / auto，
   * 再退到 hvac_modes 中第一个非 off 模式。
   */
  function resolveClimateOnMode(eid: string): string | null {
    const attrs = entitiesStore.entities[eid]?.attributes as { hvac_modes?: unknown } | undefined
    const modes = Array.isArray(attrs?.hvac_modes) ? attrs.hvac_modes.map((m) => String(m).toLowerCase()) : []
    const preferred = ['cool', 'heat', 'heat_cool', 'auto', 'fan_only', 'dry']
    for (const mode of preferred) {
      if (modes.includes(mode)) return mode
    }
    const fallback = modes.find((m) => m && m !== 'off')
    return fallback || null
  }

  /**
   * 批量关闭分组内所有活动 climate 实体。
   * 通过 set_hvac_mode(off) 实现，记录 payload 供重试。
   * 无活动实体时直接返回。
   */
  async function batchClimateOff() {
    const activeIds = climateActiveIds()
    if (activeIds.length === 0) return
    const serviceData: Record<string, unknown> = { hvac_mode: 'off' }
    batchExecuting.value = true
    lastBatchPayload.value = { domain: 'climate', service: 'set_hvac_mode', serviceData }
    try {
      await runBatch(
        'set_hvac_mode',
        activeIds.map((eid) => ({
          entity_id: eid,
          call: () => entitiesStore.callService('climate', 'set_hvac_mode', eid, serviceData, false),
        })),
      )
    } finally {
      batchExecuting.value = false
    }
  }

  /**
   * 批量开启分组内关机 climate：按实体能力 set_hvac_mode；
   * 若无可用模式列表则回退 turn_on。
   */
  async function batchClimateOn() {
    const offIds = climateOffIds()
    if (offIds.length === 0) return
    batchExecuting.value = true
    lastBatchPayload.value = {
      domain: 'climate',
      service: 'set_hvac_mode',
      serviceData: { hvac_mode: 'cool' },
    }
    try {
      await runBatch(
        'set_hvac_mode',
        offIds.map((eid) => ({
          entity_id: eid,
          call: () => {
            const mode = resolveClimateOnMode(eid)
            if (mode) {
              return entitiesStore.callService('climate', 'set_hvac_mode', eid, { hvac_mode: mode }, false)
            }
            return entitiesStore.callService('climate', 'turn_on', eid, {}, false)
          },
        })),
      )
    } finally {
      batchExecuting.value = false
    }
  }

  /**
   * 批量开关：根据 domain 选择服务路径。
   * climate 域开/关分别走 batchClimateOn / batchClimateOff；
   * 其它域走 turn_on/turn_off。
   *
   * @param turnOn true 开机、false 关机。
   * @param inferDomain 返回当前分组 domain 的函数。
   */
  async function batchToggle(turnOn: boolean, inferDomain: () => string) {
    const domain = inferDomain()
    if (domain === 'climate') {
      if (turnOn) await batchClimateOn()
      else await batchClimateOff()
      return
    }
    const service = turnOn ? 'turn_on' : 'turn_off'
    batchExecuting.value = true
    lastBatchPayload.value = { domain, service }
    try {
      await runBatch(
        service,
        entityIds.value.map((eid) => ({
          entity_id: eid,
          call: () => entitiesStore.callService(domain, service, eid, {}, false),
        })),
      )
    } finally {
      batchExecuting.value = false
    }
  }

  /**
   * 重试最近一次批量调用中失败的实体。
   * 从 failedExecItems 提取 entity_id，复用 lastBatchPayload 重新调用。
   * 无 payload 或无失败项时直接返回。
   */
  async function retryFailed() {
    if (!lastBatchPayload.value || failedExecItems.value.length === 0) return
    const ids = failedExecItems.value.map((r) => r.entity_id || '').filter((id) => id.includes('.'))
    if (ids.length === 0) return
    const { domain, service, serviceData } = lastBatchPayload.value
    batchExecuting.value = true
    try {
      await runBatch(
        service,
        ids.map((eid) => ({
          entity_id: eid,
          call: () => {
            // climate 开机重试：按实体能力重新解析模式（含 turn_on 回退），不能用固定的 'cool'
            if (domain === 'climate' && service === 'set_hvac_mode' && serviceData?.hvac_mode !== 'off') {
              const mode = resolveClimateOnMode(eid)
              if (mode) {
                return entitiesStore.callService('climate', 'set_hvac_mode', eid, { hvac_mode: mode }, false)
              }
              return entitiesStore.callService('climate', 'turn_on', eid, {}, false)
            }
            return entitiesStore.callService(domain, service, eid, serviceData ?? {}, false)
          },
        })),
      )
    } finally {
      batchExecuting.value = false
    }
  }
  return {
    batchExecuting,
    batchExecResult,
    lastBatchPayload,
    failedExecItems,
    batchToggle,
    retryFailed,
  }
}

/** - 提供分组内 climate 实体的当前/目标温度读取、温度色调与背景色映射。 */

/** 实体 store 类型，需提供 callService 方法。 */
type EntitiesStore = DeviceGroupEntitiesStoreLike & {
  callService: NonNullable<DeviceGroupEntitiesStoreLike['callService']>
}

/** 空调模式展示信息（对齐 getClimateModeMap 返回值结构） */
interface ClimateModeEntry {
  icon: typeof Settings
  label: string
  iconColor: string
  activeClass: string
}

/**
 * 取空调模式展示映射：图标、中文标签、图标色 class、激活态 class。
 * @returns 模式字符串到展示信息的映射对象。
 */
function getClimateModeMap(): Record<string, ClimateModeEntry> {
  return {
    auto: {
      icon: Settings,
      label: '自动',
      iconColor: 'text-purple-400',
      activeClass: 'bg-purple-400/15 text-purple-300 border-purple-400/30 shadow-[0_0_16px_rgba(168,85,247,0.18)]',
    },
    cool: {
      icon: ThermometerSnowflake,
      label: '制冷',
      iconColor: 'text-blue-400',
      activeClass: 'bg-blue-400/15 text-blue-300 border-blue-400/30 shadow-[0_0_16px_rgba(96,165,250,0.18)]',
    },
    dry: {
      icon: Droplets,
      label: '除湿',
      iconColor: 'text-yellow-400',
      activeClass: 'bg-yellow-400/15 text-yellow-300 border-yellow-400/30 shadow-[0_0_16px_rgba(250,204,21,0.18)]',
    },
    fan_only: {
      icon: Fan,
      label: '送风',
      iconColor: 'text-cyan-400',
      activeClass: 'bg-cyan-400/15 text-cyan-300 border-cyan-400/30 shadow-[0_0_16px_rgba(34,211,238,0.18)]',
    },
    heat: {
      icon: Flame,
      label: '制热',
      iconColor: 'text-orange-400',
      activeClass: 'bg-orange-400/15 text-orange-300 border-orange-400/30 shadow-[0_0_16px_rgba(251,146,60,0.18)]',
    },
    off: {
      icon: Power,
      label: '关闭',
      iconColor: 'text-slate-400',
      activeClass: 'bg-slate-400/15 text-slate-300 border-slate-400/30',
    },
  }
}

/**
 * 取空调状态中文标签映射。
 * @returns 状态字符串到中文标签的映射对象。
 */
function getClimateStateLabels(): Record<string, string> {
  return {
    auto: '自动',
    cool: '制冷',
    dry: '除湿',
    fan_only: '送风',
    heat: '制热',
    off: '关闭',
  }
}

/**
 * 取风扇模式中文标签映射。
 * @returns 风扇模式字符串到中文标签的映射对象。
 */
function getFanModeLabels(): Record<string, string> {
  return {
    low: '低风',
    medium: '中风',
    high: '高风',
    quiet: '静音',
  }
}

/** DeviceGroupModal 空调控制与展示辅助 */
export function useDeviceGroupClimate(
  getEntity: (eid: string) => HaEntityState | null | undefined,
  entitiesStore: EntitiesStore,
) {
  function getClimateCurrentTemp(eid: string) {
    const currentTemperature = getEntity(eid)?.attributes?.current_temperature
    return currentTemperature != null && !Number.isNaN(Number(currentTemperature)) ? Number(currentTemperature) : null
  }

  function getClimateTargetTemp(eid: string) {
    const targetTemperature = getEntity(eid)?.attributes?.temperature
    return targetTemperature != null && !Number.isNaN(Number(targetTemperature)) ? Number(targetTemperature) : null
  }

  /** 数值文本；单位由模板用 `getClimateUnit` 渲染 */
  function formatClimateTemp(temperature: number | null | undefined) {
    return temperature != null ? String(temperature) : '--'
  }

  /**
   * 该空调的温度单位（`°C` / `°F` / `K`）。
   *
   * 原先模板里写死 `°C`，°F 部署下会显示「23°C」。单位来自实体自身的
   * `temperature_unit`，取不到时回落 `°C`。
   */
  function getClimateUnit(eid: string) {
    return resolveTemperatureUnit(getEntity(eid)?.attributes)
  }

  function climateTempTone(cur: number | null | undefined) {
    if (cur == null) return ''
    if (cur >= 28) return 'text-orange-400'
    if (cur <= 18) return 'text-blue-400'
    return 'text-emerald-400'
  }

  /** 空调目标温度可调范围与步进（读实体的 min_temp / max_temp / target_temp_step，缺省 16–30/1） */
  function climateTempRange(eid: string) {
    const attributes = (getEntity(eid)?.attributes || {}) as Record<string, unknown>
    const min = Number(attributes.min_temp)
    const max = Number(attributes.max_temp)
    const step = Number(attributes.target_temp_step)
    const minValue = Number.isFinite(min) ? min : 16
    const maxValue = Number.isFinite(max) && max > minValue ? max : Math.max(minValue + 1, 30)
    return {
      min: minValue,
      max: maxValue,
      step: Number.isFinite(step) && step > 0 ? step : 1,
      dual: climateHasDualSetpoint(attributes),
    }
  }

  async function adjustClimateTemp(eid: string, delta: number) {
    const attributes = (getEntity(eid)?.attributes || {}) as Record<string, unknown>
    const { min, max, dual } = climateTempRange(eid)
    if (dual) {
      // 双温区设备只接受 target_temp_low/high：混发 temperature 会被 HA 拒绝
      const low = Number(attributes.target_temp_low)
      if (!Number.isFinite(low)) return
      const highRaw = Number(attributes.target_temp_high)
      const high = Number.isFinite(highRaw) ? highRaw : max
      const upper = Math.max(min, high - 2)
      const next = Math.min(Math.max(low + delta, min), upper)
      await entitiesStore.callService(
        'climate',
        'set_temperature',
        eid,
        { target_temp_low: next, target_temp_high: high },
        false,
      )
      return
    }
    const raw = attributes.temperature
    if (raw == null) return
    const cur = Number(raw)
    if (!Number.isFinite(cur)) return
    // 用实体自身上下限钳制，避免把支持 12–35 的机型硬卡在 16–30
    const next = Math.min(max, Math.max(min, cur + delta))
    await entitiesStore.callService('climate', 'set_temperature', eid, { temperature: next }, false)
  }

  async function setHvacMode(eid: string, mode: string) {
    await entitiesStore.callService('climate', 'set_hvac_mode', eid, { hvac_mode: mode }, false)
  }

  async function turnOffClimate(eid: string) {
    await setHvacMode(eid, 'off')
  }

  async function setFanMode(eid: string, mode: string) {
    await entitiesStore.callService('climate', 'set_fan_mode', eid, { fan_mode: mode }, false)
  }

  function getFanModeLabel(mode: string) {
    return getFanModeLabels()[mode] || mode
  }

  function hvacModes(eid: string) {
    const entity = getEntity(eid)
    const modes = entity?.attributes?.hvac_modes
    if (!Array.isArray(modes)) return []
    return modes.filter((mode): mode is string => typeof mode === 'string' && mode !== 'off')
  }

  function climateModeInfo(mode: string) {
    return (
      getClimateModeMap()[mode] || {
        icon: Settings,
        label: mode,
        iconColor: 'text-slate-300',
        activeClass: 'bg-slate-600/20 text-slate-300 border-slate-600/30',
      }
    )
  }

  function climateStateLabel(state: string | undefined) {
    if (!state) return '未知'
    return getClimateStateLabels()[state] || state
  }

  function climateBgColor(state: string | undefined) {
    return state === 'cool'
      ? 'rgba(96,165,250,0.15)'
      : state === 'heat'
        ? 'rgba(251,146,60,0.15)'
        : state === 'dry'
          ? 'rgba(250,204,21,0.15)'
          : state === 'fan_only'
            ? 'rgba(34,211,238,0.15)'
            : state === 'auto'
              ? 'rgba(168,85,247,0.15)'
              : state === 'off'
                ? 'rgba(75,85,99,0.3)'
                : 'rgba(34,197,94,0.15)'
  }

  function climateBorderColor(state: string | undefined) {
    return state === 'cool'
      ? 'rgba(96,165,250,0.3)'
      : state === 'heat'
        ? 'rgba(251,146,60,0.3)'
        : state === 'dry'
          ? 'rgba(250,204,21,0.3)'
          : state === 'fan_only'
            ? 'rgba(34,211,238,0.3)'
            : state === 'auto'
              ? 'rgba(168,85,247,0.3)'
              : state === 'off'
                ? 'rgba(255,255,255,0.1)'
                : 'rgba(34,197,94,0.3)'
  }

  function climateIconEmoji(state: string | undefined) {
    return state === 'cool'
      ? '❄️'
      : state === 'heat'
        ? '🔥'
        : state === 'dry'
          ? '💧'
          : state === 'fan_only'
            ? '🌀'
            : state === 'auto'
              ? '🤖'
              : state === 'off'
                ? '⏸️'
                : '✅'
  }

  return {
    getClimateCurrentTemp,
    getClimateTargetTemp,
    getClimateUnit,
    formatClimateTemp,
    climateTempTone,
    adjustClimateTemp,
    setHvacMode,
    turnOffClimate,
    setFanMode,
    getFanModeLabel,
    hvacModes,
    climateModeInfo,
    climateStateLabel,
    climateBgColor,
    climateBorderColor,
    climateIconEmoji,
  }
}

/** 并维护"是否显示审计面板"开关。 */

/**
 * 计算 DeviceGroupModal 展示的实体 ID 列表。
 *
 * @returns entityIds 当前实体 ID 列表 ref；showAudit 是否显示审计面板；computeEntityIds 主动重算方法
 */
export function useDeviceGroupEntityIds() {
  const entityIds = ref<string[]>([])
  // 系统审计面板默认展开（弹窗打开时由父组件重置为 true）
  const showAudit = ref(true)

  /**
   * 重新计算实体 ID 列表。
   *
   * @param props 含 domain 与 statsSensors 配置
   * @param entitiesStore 实体 store（提供按 ID 取实体）
   * @param uiStore UI store（含 layoutConfig.statsSensors 兜底配置）
   */
  function computeEntityIds(
    props: { domain?: string; statsSensors?: Record<string, unknown> },
    entitiesStore: DeviceGroupEntitiesStoreLike,
    uiStore: DeviceGroupUiStoreLike,
  ) {
    const domain = props.domain
    // 优先用 props.statsSensors，否则兜底到 uiStore.layoutConfig.statsSensors
    const statsId = props.statsSensors || uiStore.layoutConfig.statsSensors
    entityIds.value = resolveDeviceGroupEntityIds(
      domain || '',
      entitiesStore,
      uiStore,
      statsId as Record<string, string | undefined> | null | undefined,
    )
  }
  return { entityIds, showAudit, computeEntityIds }
}

/** 域常量（MONITORED_ENTITY_IDS / DOMAIN_LIST）请直接从 `@/shared/constants/device-group` 导入。 */

/**
 * 随语言切换返回最新标签（勿在模块顶层缓存）。
 * 标签中含 emoji 与中文说明，颜色取自 entity-domain-meta。
 */
export function getDomainMap() {
  return {
    light: { label: '💡 常用灯光', color: entityDomainColor('light') },
    climate: { label: '🌡️ 常用温控', color: entityDomainColor('climate') },
    sensor: { label: '📡 常用传感', color: entityDomainColor('sensor') },
    switch: { label: '🔌 常用开关', color: entityDomainColor('switch') },
    battery: { label: '🪫 全局低电量告警', color: '#fb923c' },
    offline: { label: '🔴 离线设备诊断', color: '#f87171' },
    lock: { label: '🔐 安全门锁', color: entityDomainColor('lock') },
    cover: { label: '🪟 窗帘卷帘', color: entityDomainColor('cover') },
    camera: { label: '📷 监控设备', color: entityDomainColor('camera') },
    media_player: { label: '🎵 多媒体', color: entityDomainColor('media_player') },
    fan: { label: '🌀 风扇设备', color: entityDomainColor('fan') },
    vacuum: { label: '🧹 扫地机器人', color: entityDomainColor('vacuum') },
  }
}
/**
 * 按 ID 从实体字典中取实体，未命中返回 null。
 *
 * @param entities 实体字典
 * @param eid 实体 ID
 * @returns 实体对象或 null
 */
export function getEntityFromStore(entities: Record<string, unknown>, eid: string) {
  return entities[eid] || null
}

/** - 当 domain 为 'offline' 时计算离线实体集合，并拆分为关键离线项； */

/**
 * 离线的**故障性质**：从设备自身的实体集合算出来，不是查表猜的。
 *
 * HA 对离线实体只给 `unavailable` / `unknown` 两个值，单看这个等于每行都写「不可用」，
 * 没有信息量。真正可操作的是下面几档 —— 它们回答「整机掉线还是部分失效」：
 *
 * - `整台离线`：该设备**全部**实体都不可用 —— 集成/电源层面断了，按一台查；
 * - `部分失效 N/M`：只有 N 个实体不可用 —— 单个实体或子功能坏了，按条目查；
 * - `无状态`：状态是 `unknown` —— 集在线但没上报（刚重启 / 电池设备休眠）；
 * - `未同步`：实体不在状态库 —— 只有注册表记录，还没收到状态。
 *
 * 与 `offlineReason` 的区别：那个按 domain 猜原因（措辞必须写「可能原因」），
 * 这个是从实体集合直接数出来的事实。
 */
export interface OfflineStateLabel {
  label: string
  /** 供 CSS 选色：整台掉线与部分失效的处置优先级不同。 */
  tone: 'down' | 'partial' | 'unknown' | 'missing'
}

/**
 * 按设备聚合出的故障性质。
 *
 * @param entityIds 该设备下的**全部**实体（`groupOfflineByDevice` 的 `entityIds`）
 * @param getEntity 取实体
 */
function offlineStateLabel(
  entityIds: string[],
  getEntity: (eid: string) => HaEntityState | null | undefined,
): OfflineStateLabel {
  if (entityIds.length === 0) return { label: '未同步', tone: 'missing' }
  const present = entityIds.map((eid) => getEntity(eid)).filter((entity): entity is HaEntityState => Boolean(entity))
  if (present.length === 0) return { label: '未同步', tone: 'missing' }

  const lower = (entity: HaEntityState) => String(entity.state || '').toLowerCase()
  const unknown = present.filter((entity) => lower(entity) === 'unknown').length
  // 全是 unknown：没上报，不是联系不上 —— 与 unavailable 的处置完全不同。
  if (unknown === present.length) return { label: '无状态', tone: 'unknown' }

  const total = present.length
  const unavailable = present.filter((entity) => lower(entity) === 'unavailable').length
  // 「全部实体都不可用」才是整机掉线。HA 的 device 里常混着 button / event 等辅助实体，
  // 只要有一个还活着就说明集成在线，问题局限在个别实体上。
  if (unavailable >= total) return { label: '整台离线', tone: 'down' }
  return { label: `部分失效 ${unavailable}/${total}`, tone: 'partial' }
}

/**
 * 实体所属**集成名**（`xiaomi_home` / `miwifi_router` / `generic` …）。
 *
 * 设备掉线时这是唯一可操作的线索 —— 它回答「去 HA 里看哪个集成」。后端从实体注册表
 * 取 `platform` 写进 `attributes.platform`（见 `entity_area.enrich_entity_areas`）。
 */
function integrationOf(eid: string, getEntity: (eid: string) => HaEntityState | null | undefined): string {
  const attrs = getEntity(eid)?.attributes as Record<string, unknown> | undefined
  return String(attrs?.platform ?? '').trim()
}

/**
 * 离线的**可能原因**（启发式提示，不是诊断结论）。
 *
 * 只按 domain 查表，不读任何证据。因此所有展示点都必须带「可能原因」限定措辞 ——
 * 曾经紧凑列表直接把它当结论显示，于是路由器的软件开关也写着「电源故障？」，
 * 用户会去检查一个没坏的电源。紧凑列表现在改为显示离线时长（唯一有据可查的信号）。
 */
const OFFLINE_REASON: Record<string, string> = {
  binary_sensor: '无响应，链路质量可能较差。',
  camera: '连接失败，请检查电源与 Wi-Fi。',
  climate: '控制器超时，请检查设备连接与网关状态。',
  light: '灯泡无响应，请确认开关已开启。',
  lock: '网关错误，请检查桥接连接。',
  media_player: '设备不可达，请检查局域网状态。',
  sensor: '信号丢失，请检查电池或网关桥接。',
  switch: '插座不可达，请检查电源与距离。',
}
/** domain -> 离线图标映射（未命中回退 AlertTriangle） */
const offlineIconMap: Record<string, Component> = {
  light: Sun,
  switch: Plug,
  sensor: Bell,
  binary_sensor: Bell,
  camera: Camera,
  lock: Lock,
  climate: Thermometer,
  media_player: Music,
}

/**
 * 离线 / 低电量统计与展示辅助。
 *
 * @param props 含 domain（'offline' / 'battery' 时启用对应统计）
 * @param entityIds 当前分组实体 ID 列表
 * @param entitiesStore 实体 store
 * @param uiStore UI store（layoutConfig 等）
 * @param getEntity 按 ID 取实体的函数
 * @returns offlineStats 离线统计；batteryStats 低电量统计；offlineIcon/offlineReason/offlineState/integration/timeAgo/batteryColor 辅助方法
 */
/**
 * 离线统计（按**设备**聚合，再拆「严重告警」与「系统审计」）。
 *
 * 抽成模块级函数而不是内联 computed：内联写法会把「聚合口径」和组件状态混在一起，
 * 也让这段统计无法单独测试。
 *
 * 口径是设备而不是实体 —— 一台掉线的多传感器设备会贡献 5~10 条实体，按实体列会让
 * 弹窗标题写成「共 131 个设备」而实际只有十几台连不上。拆两组的依据是**代表实体**是否
 * 在 critical 集合（用户收藏 / 首页浮动组件）里，同一台设备只出现在一侧。
 */
function buildOfflineStats(
  entityIds: string[],
  entitiesStore: DeviceGroupEntitiesStoreLike,
  uiStore: DeviceGroupUiStoreLike,
) {
  const criticalSet = computeOfflineCriticalSet(uiStore, entitiesStore)
  const groups = groupOfflineByDevice(entityIds, entitiesStore.entities)
  const isCritical = (group: { entityIds: string[] }) => group.entityIds.some((eid) => criticalSet.has(eid))
  return {
    critical: groups.filter(isCritical),
    others: groups.filter((group) => !isCritical(group)),
    /** 离线设备总数（弹窗标题用）。 */
    deviceCount: groups.length,
  }
}

export function useDeviceGroupOffline(
  props: { domain?: string },
  entityIds: Ref<string[]>,
  entitiesStore: DeviceGroupEntitiesStoreLike,
  uiStore: DeviceGroupUiStoreLike,
  getEntity: (eid: string) => HaEntityState | null | undefined,
) {
  // 离线统计：仅 domain === 'offline' 时计算（口径说明见 buildOfflineStats）。
  const offlineStats = computed(() =>
    props.domain === 'offline' ? buildOfflineStats(entityIds.value, entitiesStore, uiStore) : null,
  )
  // 低电量统计：仅 domain === 'battery' 时计算，按电量升序排序后分临界 / 正常两组
  const batteryStats = computed(() => {
    if (props.domain !== 'battery') return null
    const items = entityIds.value
      .map((eid) => {
        const entity = getEntity(eid)
        const level = resolveBatteryLevel(eid, entity ?? undefined, entitiesStore)
        return { id: eid, entity, level }
      })
      .filter((x) => x.entity && !isNaN(x.level))
      // 按电量升序：最低的排最前
      .sort((a, b) => a.level - b.level)
    return {
      critical: items.filter((x) => x.level <= BATTERY_LOW_THRESHOLD),
      normal: items.filter((x) => x.level > BATTERY_LOW_THRESHOLD),
    }
  })
  /** 按 domain 取离线图标，未命中回退告警三角图标。 */
  function offlineIcon(eid: string) {
    return offlineIconMap[getEntityDomain(eid)] || AlertTriangle
  }
  /** 按 domain 取离线的「可能原因」（启发式，见模块顶部的 OFFLINE_REASON 说明）。 */
  function offlineReason(eid: string) {
    const d = getEntityDomain(eid)
    return OFFLINE_REASON[d] ?? '未上报可用状态。'
  }
  /** 故障性质（整台离线 / 部分失效 / 无状态 / 未同步），按设备实体集合算出。 */
  function offlineState(entityIds: string[]) {
    return offlineStateLabel(entityIds, getEntity)
  }
  /** 该设备所属集成名（掉线时指向「去 HA 查哪个集成」）。 */
  function integration(eid: string) {
    return integrationOf(eid, getEntity)
  }
  /** 离线时长文案：离线实体的 `last_changed` 就是它变为不可用的时刻。 */
  function timeAgo(eid: string) {
    const e = getEntity(eid)
    // 收敛到 ``formatRelativeFromNow``：这里此前是一份手写副本，跨过 30 天时永远回
    // 「N 天前」，而权威实现会退回本地短日期；两份实现迟早会继续漂移。
    return formatRelativeFromNow(e?.last_changed, '无记录')
  }
  /** 按电量取色阶（<=20 红 / <=50 橙 / 其余绿）。 */
  function batteryColor(v: number) {
    return v <= 20
      ? { tone: 'tone-low', bg: 'bg-red-500', text: 'text-red-400' }
      : v <= 50
        ? { tone: 'tone-mid', bg: 'bg-orange-500', text: 'text-orange-400' }
        : { tone: 'tone-ok', bg: 'bg-emerald-500', text: 'text-emerald-400' }
  }
  return {
    offlineStats,
    batteryStats,
    offlineIcon,
    offlineReason,
    offlineState,
    integration,
    timeAgo,
    batteryColor,
  }
}
