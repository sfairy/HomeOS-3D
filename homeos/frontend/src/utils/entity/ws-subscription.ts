/**
 * @file entity-ws-subscription.ts
 * @module frontend/src/utils
 * entity WebSocket domain 订阅解析：按路由与布局计算订阅白名单 / pinned 实体收集
 * （含本机人来亮屏充电器开关，避免冷实体漏推）。
 */
import type { PanelWidget } from '@/types/layout'
import { getEntityDomain, resolveChargerSwitchWakeEntityIdForDevice } from '@homeos/shared'
import { getClientDeviceId } from '@/utils/client/system.util'
import { getConfigSection } from '@/utils/config/frontend-config'

// ── entity-ws-subscription.util ──
/**
 * 按路由与布局计算 WebSocket domain 订阅白名单（null = 订阅全部）
 */

const BASE_DOMAINS = ['sun', 'weather', 'person', 'zone']

/** Dashboard 常驻控制域（不含高频 sensor/binary_sensor，由浮窗与侧栏 Widget 按需追加） */
const DASHBOARD_CORE_DOMAINS = [
  'light',
  'switch',
  'cover',
  'climate',
  'media_player',
  'fan',
  'lock',
  'camera',
  'scene',
  'input_boolean',
  'alarm_control_panel',
  'number',
  'select',
  'button',
  'input_number',
  'input_select',
  'input_text',
  'input_datetime',
  'vacuum',
  'humidifier',
  'water_heater',
  'remote',
  'siren',
  'valve',
  'group',
]

/** 仅事件页保留全域订阅；设备页改为可控域白名单，降低传感器爆发时的推送量 */
function needsFullDomainSubscription(path: string): boolean {
  if (path.startsWith('/events')) return true
  return false
}

/** /devices 列表常用域（对齐 useDevicesView PREFERRED + 可控域） */
const DEVICES_PAGE_DOMAINS = [
  ...DASHBOARD_CORE_DOMAINS,
  'sensor',
  'binary_sensor',
  'device_tracker',
]

const SECURITY_DOMAINS = [
  'binary_sensor',
  'camera',
  'lock',
  'alarm_control_panel',
  'device_tracker',
  'cover',
  'light',
  'switch',
  'valve',
  'fan',
]

const WIDGET_DOMAIN_HINTS: Record<string, readonly string[]> = {
  weather: ['weather', 'sun'],
  homeClimateChart: ['sensor', 'climate'],
  utilityMeter: ['sensor', 'utility_meter'],
  mediaPlayer: ['media_player'],
  mediaMini: ['media_player'],
  securityStatus: ['alarm_control_panel', 'binary_sensor'],
  securityPanel: ['alarm_control_panel', 'binary_sensor', 'camera', 'lock'],
  quickActions: ['scene', 'script'],
}

type EntityRefWidget = {
  type?: string
  entityId?: string
  entity_id?: string
}

type LayoutWidgetRef = PanelWidget & EntityRefWidget

/** 顶层悬浮组件（实体引用统一走 config.entityId / config.entity_id） */
type LayoutFloatingWidgetRef = {
  id?: string
  type?: string
  config?: Record<string, unknown> | null
}

/**
 * 订阅计算所需的布局切片（结构类型，兼容完整 UILayoutConfig 与局部投影）。
 * 2D 楼层/热点字段已退役，实体引用只来自顶层浮窗、侧栏组件与顶层统计传感器。
 */
type LayoutSubscriptionConfig = {
  floatingWidgets?: LayoutFloatingWidgetRef[] | null
  statsSensors?: object | null
  rightPanelWidgets?: LayoutWidgetRef[] | null
  leftPanelWidgets?: LayoutWidgetRef[] | null
}

export function resolveSubscribeDomains(
  routePath: string | undefined,
  layoutConfig: LayoutSubscriptionConfig | undefined,
): string[] | null {
  const path = routePath || '/'

  if (path.startsWith('/settings') || path.startsWith('/builder') || path.startsWith('/embed')) {
    return null
  }

  if (needsFullDomainSubscription(path)) {
    return null
  }

  const domains = new Set(BASE_DOMAINS)

  if (
    path === '/devices' ||
    path.startsWith('/devices/') ||
    path === '/device' ||
    path.startsWith('/device/')
  ) {
    for (const d of DEVICES_PAGE_DOMAINS) domains.add(d)
    return [...domains]
  }

  if (path.startsWith('/security')) {
    for (const d of SECURITY_DOMAINS) domains.add(d)
    return [...domains]
  }

  for (const d of DASHBOARD_CORE_DOMAINS) domains.add(d)

  if (layoutConfig) {
    forEachLayoutEntityRef(layoutConfig, (ref) => {
      // WIDGET_DOMAIN_HINTS 只用于侧栏组件；浮窗继续只订具体 entity，避免能源浮窗把整个 sensor 域打开
      if (ref.source === 'panelWidget' && ref.type) {
        const hints = WIDGET_DOMAIN_HINTS[ref.type]
        if (hints) {
          for (const d of hints) domains.add(d)
        }
      }
      const entityId = ref.entityId
      if (!entityId) return
      // 与历史行为一致：浮窗/统计传感器的引用需形如 domain.entity 才计入域订阅
      const needsEntityDot = ref.source === 'floatingWidget' || ref.source === 'statSensor'
      if (needsEntityDot && !entityId.includes('.')) return
      domains.add(getEntityDomain(entityId))
    })
  }

  return [...domains]
}

/** 布局实体引用来源 */
type LayoutEntityRefSource = 'panelWidget' | 'floatingWidget' | 'statSensor'

/** forEachLayoutEntityRef 迭代出的实体引用（snake/camel 双命名已按来源既有优先级归一） */
interface LayoutEntityRef {
  source: LayoutEntityRefSource
  entityId: string | undefined
  /** widget 类型（仅侧栏组件用于 WIDGET_DOMAIN_HINTS） */
  type: string | undefined
}

/**
 * 统一遍历布局中的实体引用位：侧栏组件 / 顶层浮窗 / 顶层统计传感器。
 * 各来源的 ID 提取优先级与历史行为保持一致。
 */
function forEachLayoutEntityRef(
  layoutConfig: LayoutSubscriptionConfig | undefined | null,
  cb: (ref: LayoutEntityRef) => void,
): void {
  if (!layoutConfig) return
  for (const w of layoutConfig.rightPanelWidgets || []) {
    cb({ source: 'panelWidget', entityId: w?.entityId || w?.entity_id, type: w?.type })
  }
  for (const w of layoutConfig.leftPanelWidgets || []) {
    cb({ source: 'panelWidget', entityId: w?.entityId || w?.entity_id, type: w?.type })
  }
  for (const w of layoutConfig.floatingWidgets || []) {
    const cfg = (w?.config || {}) as { entityId?: unknown; entity_id?: unknown }
    const rawId = cfg.entityId ?? cfg.entity_id
    cb({
      source: 'floatingWidget',
      entityId: rawId == null || rawId === '' ? undefined : String(rawId),
      type: w?.type,
    })
  }
  const stats = layoutConfig.statsSensors
  if (stats && typeof stats === 'object') {
    for (const v of Object.values(stats)) {
      if (typeof v === 'string' && v) cb({ source: 'statSensor', entityId: v, type: undefined })
    }
  }
}

/** 布局订阅指纹：浮窗/统计传感器/侧栏组件变化时触发 WS 域重算 */
export function buildLayoutSubscriptionKey(
  layoutConfig: LayoutSubscriptionConfig | null | undefined,
  activePopupEntityId: string | null | undefined,
): string {
  if (!layoutConfig) return ''
  return JSON.stringify({
    floatingWidgets: (layoutConfig.floatingWidgets || []).map((w) => {
      const cfg = (w?.config || {}) as { entityId?: unknown; entity_id?: unknown }
      return String(cfg.entityId || cfg.entity_id || w?.id || '')
    }),
    statsSensors: layoutConfig.statsSensors || null,
    rightPanelWidgets: (layoutConfig.rightPanelWidgets || []).map(
      (w) => w?.entityId || w?.entity_id || w?.id || w?.type || '',
    ),
    leftPanelWidgets: (layoutConfig.leftPanelWidgets || []).map(
      (w) => w?.entityId || w?.entity_id || w?.id || w?.type || '',
    ),
    activePopupEntityId: activePopupEntityId || '',
  })
}

let activeSubscribeDomains: string[] | null = null

export function setActiveSubscribeDomains(domains: string[] | null): void {
  activeSubscribeDomains = domains?.length ? [...domains] : null
}

export function getActiveSubscribeDomains(): string[] | null {
  return activeSubscribeDomains
}

function addPinnedId(ids: Set<string>, raw: unknown): void {
  const id = raw == null ? '' : String(raw)
  if (id.includes('.')) ids.add(id)
}

/**
 * 收集布局上「可见」实体 ID（冷实体 WS pinned：浮窗/统计传感器/侧栏）
 */
export function collectPinnedEntityIds(
  layoutConfig: LayoutSubscriptionConfig | undefined,
): string[] {
  if (!layoutConfig) return []
  const ids = new Set<string>()
  forEachLayoutEntityRef(layoutConfig, (ref) => {
    if (ref.entityId) addPinnedId(ids, ref.entityId)
  })
  return [...ids]
}

/**
 * 布局可见实体 + 当前活跃弹窗实体 + 本机人来亮屏充电器开关（冷实体 WS pinned 推送）。
 * `activePopupEntityId` 应为栈 A 实体控制或栈 B 媒体全屏打开的 entity_id。
 */
export function collectWsPinnedEntityIds(
  layoutConfig: LayoutSubscriptionConfig | undefined,
  activePopupEntityId: string | null | undefined,
): string[] {
  const ids = collectPinnedEntityIds(layoutConfig)
  const extra =
    activePopupEntityId && String(activePopupEntityId).includes('.')
      ? String(activePopupEntityId)
      : null
  if (extra && !ids.includes(extra)) ids.push(extra)
  const wakeId = resolveChargerSwitchWakeEntityIdForDevice(
    getConfigSection('clientPowerWake'),
    getClientDeviceId(),
  )
  if (wakeId.includes('.') && !ids.includes(wakeId)) ids.push(wakeId)
  return ids
}
