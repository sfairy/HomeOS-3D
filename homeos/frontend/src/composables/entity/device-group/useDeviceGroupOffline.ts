/** - 当 domain 为 'offline' 时计算离线实体集合，并拆分为关键离线项； */
import { getEntityDomain } from '@homeos/shared'
import { computed, type Ref } from 'vue'
import { Sun, Plug, Bell, Camera, Lock, Thermometer, Music, AlertTriangle } from '@lucide/vue'
import { computeOfflineCriticalSet, groupOfflineByDevice } from '@/shared/device/utils/group-offline.util'
import { BATTERY_LOW_THRESHOLD, resolveBatteryLevel } from '@/shared/device/utils/group-battery.util'
import { formatRelativeFromNow } from '@/shared/utils/format/locale-format.util'
import type { DeviceGroupEntitiesStoreLike, DeviceGroupUiStoreLike } from '@/shared/device/utils/group-battery.util'
import type { HaEntityState } from '@/shared/types/entity-store'
import type { Component } from 'vue'

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
