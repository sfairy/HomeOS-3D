/**
 * @file entity-ws-subscription.ts
 * @module frontend/src/utils
 * entity WebSocket domain 订阅解析：按路由与布局计算订阅白名单 / pinned 实体收集
 * （含本机人来亮屏充电器开关，避免冷实体漏推）。
 */
import type { FloorConfig, PanelWidget, UILayoutConfig } from '@/types/layout'
import { getEntityDomain, resolveChargerSwitchWakeEntityIdForDevice } from '@homeos/shared'
import { getClientDeviceId } from '@/utils/client/system.util'
import { getConfigSection } from '@/utils/config/frontend-config'

// ── entity-ws-subscription.util ──
/**
 * 按路由与布局计算 WebSocket domain 订阅白名单（null = 订阅全部）
 */

const BASE_DOMAINS = ['sun', 'weather', 'person', 'zone']

/** Dashboard 常驻控制域（不含高频 sensor/binary_sensor，由布局热点与 Widget 按需追加） */
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

/** 设备/联动页需订阅全部 domain 的实时推送 */
function needsFullDomainSubscription(path: string): boolean {
  if (path === '/devices' || path.startsWith('/devices/')) return true
  if (path === '/m/devices' || path.startsWith('/m/devices/')) return true
  if (path === '/device' || path.startsWith('/device/')) return true
  if (path.startsWith('/linkage')) return true
  if (path.startsWith('/events')) return true
  return false
}

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
  homeEnvironment: ['sensor'],
  homeClimateChart: ['sensor', 'climate'],
  climateHub: ['sensor', 'climate'],
  tempChart: ['sensor'],
  sensorTrend: ['sensor'],
  energyOverview: ['sensor', 'utility_meter', 'energy'],
  energyDashboard: ['sensor', 'utility_meter', 'energy'],
  utilityMeter: ['sensor', 'utility_meter'],
  mediaPlayer: ['media_player'],
  mediaMini: ['media_player'],
  securityStatus: ['alarm_control_panel', 'binary_sensor'],
  securityPanel: ['alarm_control_panel', 'binary_sensor', 'camera', 'lock'],
  lockHub: ['lock'],
  coverGroup: ['cover'],
  switchGroup: ['switch'],
  careHub: ['binary_sensor', 'sensor', 'person'],
  smartAdvisor: ['sensor', 'binary_sensor'],
  sceneHub: ['scene'],
  sceneScript: ['scene', 'script'],
  quickActions: ['scene', 'script'],
  scheduleHub: ['calendar'],
}

type EntityRefWidget = {
  type?: string
  entityId?: string
  entity_id?: string
}

type LayoutWidgetRef = PanelWidget & EntityRefWidget

type FloorWidgetRef = {
  id?: string
  entityId?: string
  entity_id?: string
}

type LayoutHotspotRef = {
  entityId?: string
  entity_id?: string
  id?: string
}

type LayoutFloorRef = FloorConfig & {
  hotspots?: LayoutHotspotRef[]
  leftPanelWidgets?: LayoutWidgetRef[]
}

type LayoutSubscriptionConfig = Pick<UILayoutConfig, 'floors'> & {
  rightPanelWidgets?: LayoutWidgetRef[]
  leftPanelWidgets?: LayoutWidgetRef[]
  floors?: LayoutFloorRef[]
}

/** resolveSubscribeDomains：函数，按签名入参返回处理结果。 */
export function resolveSubscribeDomains(
  routePath: string | undefined,
  layoutConfig: LayoutSubscriptionConfig | undefined,
): string[] | null {
  const path = routePath || '/'

  if (path.startsWith('/settings') || path.startsWith('/builder') || path.startsWith('/embed')) {
    return null
  }
  if (path.startsWith('/m/settings')) {
    return null
  }

  if (needsFullDomainSubscription(path)) {
    return null
  }

  const domains = new Set(BASE_DOMAINS)

  if (path.startsWith('/security') || path.startsWith('/m/security')) {
    for (const d of SECURITY_DOMAINS) domains.add(d)
    return [...domains]
  }

  if (path.startsWith('/m/energy')) {
    for (const d of ['sensor', 'utility_meter', 'energy']) domains.add(d)
  }

  if (path.startsWith('/m/alerts')) {
    for (const d of SECURITY_DOMAINS) domains.add(d)
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
      // 与历史行为一致：楼层部件/浮窗/统计传感器的引用需形如 domain.entity 才计入域订阅
      const needsEntityDot =
        ref.source === 'floorWidget' || ref.source === 'floatingWidget' || ref.source === 'statSensor'
      if (needsEntityDot && !entityId.includes('.')) return
      domains.add(getEntityDomain(entityId))
    })
  }

  return [...domains]
}

/** 布局实体引用来源 */
type LayoutEntityRefSource =
  | 'panelWidget'
  | 'floorWidget'
  | 'hotspot'
  | 'floatingWidget'
  | 'statSensor'

/** forEachLayoutEntityRef 迭代出的实体引用（snake/camel 双命名已按来源既有优先级归一） */
interface LayoutEntityRef {
  source: LayoutEntityRefSource
  entityId: string | undefined
  /** widget 类型（仅侧栏组件用于 WIDGET_DOMAIN_HINTS） */
  type: string | undefined
}

/**
 * 统一遍历布局中的实体引用位：侧栏组件 / 楼层部件 / 热点 / 浮窗 / 统计传感器。
 * 各来源的 ID 提取优先级与历史行为保持一致（楼层部件 id 优先，热点 entityId 优先）。
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
  for (const floor of layoutConfig.floors || []) {
    if (!floor) continue
    for (const w of (floor.widgets || []) as FloorWidgetRef[]) {
      cb({ source: 'floorWidget', entityId: w?.id || w?.entityId || w?.entity_id, type: undefined })
    }
    for (const h of floor.hotspots || []) {
      cb({ source: 'hotspot', entityId: h?.entityId || h?.entity_id || h?.id, type: undefined })
    }
    for (const w of floor.floatingWidgets || []) {
      const cfg = (w as { config?: Record<string, unknown> })?.config
      const rawId = cfg?.entityId || cfg?.entity_id
      cb({
        source: 'floatingWidget',
        entityId: rawId == null ? undefined : String(rawId),
        type: w?.type,
      })
    }
    const stats = (
      floor as { statsSensors?: Record<string, string> | null }
    )?.statsSensors
    if (stats && typeof stats === 'object') {
      for (const v of Object.values(stats)) {
        if (v != null) cb({ source: 'statSensor', entityId: String(v), type: undefined })
      }
    }
  }
}

type LayoutSubscriptionKeyConfig = LayoutSubscriptionConfig & {
  activeFloorId?: string
  floors?: LayoutFloorRef[]
}

/** 布局订阅指纹：热点/部件变化时触发 WS 域重算 */
export function buildLayoutSubscriptionKey(
  layoutConfig: LayoutSubscriptionKeyConfig | null | undefined,
  activePopupEntityId: string | null | undefined,
): string {
  if (!layoutConfig) return ''
  const floors = (layoutConfig.floors || []).map((floor: LayoutFloorRef) => ({
    id: floor.id,
    hotspots: (floor.hotspots || []).map(
      (h: LayoutHotspotRef) => h?.entityId || h?.entity_id || h?.id || '',
    ),
    widgets: (floor.widgets || []).map(
      (w: FloorWidgetRef) => w?.id || w?.entityId || w?.entity_id || '',
    ),
    floatingWidgets: (floor.floatingWidgets || []).map((w) => {
      const cfg = (w as { config?: Record<string, unknown> })?.config
      return String(cfg?.entityId || cfg?.entity_id || w?.id || '')
    }),
    statsSensors: (floor as { statsSensors?: Record<string, string> }).statsSensors || null,
  }))
  return JSON.stringify({
    activeFloorId: layoutConfig.activeFloorId,
    rightPanelWidgets: (layoutConfig.rightPanelWidgets || []).map(
      (w) => w?.entityId || w?.entity_id || w?.id || w?.type || '',
    ),
    leftPanelWidgets: (layoutConfig.leftPanelWidgets || []).map(
      (w) => w?.entityId || w?.entity_id || w?.id || w?.type || '',
    ),
    floors,
    activePopupEntityId: activePopupEntityId || '',
  })
}

let activeSubscribeDomains: string[] | null = null

/** setActiveSubscribeDomains：函数，按签名入参返回处理结果。 */
export function setActiveSubscribeDomains(domains: string[] | null): void {
  activeSubscribeDomains = domains?.length ? [...domains] : null
}

/** getActiveSubscribeDomains：函数，按签名入参返回处理结果。 */
export function getActiveSubscribeDomains(): string[] | null {
  return activeSubscribeDomains
}

function addPinnedId(ids: Set<string>, raw: unknown): void {
  const id = raw == null ? '' : String(raw)
  if (id.includes('.')) ids.add(id)
}

/**
 * 收集布局上「可见」实体 ID（冷实体 WS pinned：热点/楼层部件/浮窗/侧栏）
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
 * 布局可见实体 + 当前活跃弹窗实体 + 本机人来亮屏充电器开关（冷实体 WS pinned 推送）
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
