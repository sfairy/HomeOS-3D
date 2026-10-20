/**
 * @file useSecuritySensors.ts
 * @module composables/security
 * @description 安防传感器聚合 composable，统一汇总绑定与未绑定的安全传感器。
 *   - 通过 hazardBindingMap 识别已绑定的危险传感器（烟感/燃气/水浸）
 *   - 按关键字匹配对未绑定传感器分类（烟感/燃气/CO/水浸/门窗/移动）
 *   - 派生告警数、告警 Chip、统计卡片、过滤器等 UI 所需结构
 *   - 模块级共享告警确认状态，保证导航角标与总览一致
 * @dependencies @homeos/shared, vue, @lucide/vue, @/stores/entities.store, @/stores/layout.store, @/shared/entity/utils/derived.util, @/features/security/utils/sensor-filter.util, @/features/security/utils/zone-mode.util
 */
import { getEntityDomain, buildHazardBindingMap, type HazardSensorKind, getEntityLeaf } from '@homeos/shared'
import { ref, computed, toRaw } from 'vue'
import { Activity, Flame, Droplets, Wind, DoorOpen } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { getEntityDisplayName } from '@/shared/entity/utils/derived.util'
import { isSecurityUtilityNoise } from '@/features/security/utils/sensor-filter.util'
import { isSensorAlertState } from '@/features/security/utils/zone-mode.util'

// 移动传感器关键字（中英文）
const MOTION_KEYS = ['motion', 'occupancy', 'presence', '移动', '人体', '存在', '占位']
// 门窗传感器关键字
const DOOR_KEYS = ['door', 'window', 'contact', '门磁', '窗磁', '门', '窗']
// 烟感传感器关键字
const SMOKE_KEYS = ['smoke', '烟雾', '烟感']
// 燃气传感器关键字
const GAS_KEYS = ['gas', 'methane', '燃气', '甲烷', '天然气']
// 水浸传感器关键字
const LEAK_KEYS = ['leak', 'moisture', '漏水', '水浸']
// 一氧化碳传感器关键字
const CO_KEYS = ['co', 'carbon_monoxide', '一氧化碳']

/** 传感器类型到中文标签的映射 */
const SENSOR_TYPE_LABELS: Record<string, string> = {
  smoke: '烟感',
  gas: '燃气',
  co: 'CO',
  leak: '水浸',
  door: '门窗',
  motion: '移动',
}

/** 危险传感器种类到内部类型字符串的映射 */
const HAZARD_KIND_TO_TYPE: Record<HazardSensorKind, string> = {
  smoke: 'smoke',
  gas: 'gas',
  leak: 'leak',
}

/**
 * 获取传感器类型标签
 * @param type 传感器类型
 * @returns 中文标签，未知类型原样返回
 */
function sensorLabel(type: string) {
  return SENSOR_TYPE_LABELS[type] ?? type
}

/**
 * 判断实体 ID 或名称是否包含任一关键字
 * @param id 实体 ID
 * @param name 实体名称
 * @param keys 关键字列表
 * @returns 是否匹配
 */
function matchAny(id: string, name: string, keys: string[]) {
  const lowerId = id.toLowerCase()
  const lowerName = (name || '').toLowerCase()
  return keys.some((k) => lowerId.includes(k) || lowerName.includes(k))
}

/**
 * 按关键字对未绑定传感器分类
 * @param id 实体 ID
 * @param name 实体名称
 * @returns 分类结果（含类型、排序、图标、颜色、CSS）；非安全传感器返回 null
 */
function classifySensor(id: string, name: string) {
  // 工具噪声（如空调状态）不归入安全传感器
  if (isSecurityUtilityNoise(id, name)) return null
  if (matchAny(id, name, SMOKE_KEYS))
    return {
      type: 'smoke',
      order: 0,
      iconComp: Flame,
      iconColor: 'text-red-400',
      css: 'sec-event-item--danger',
    }
  if (matchAny(id, name, GAS_KEYS))
    return {
      type: 'gas',
      order: 1,
      iconComp: Wind,
      iconColor: 'text-orange-400',
      css: 'sec-event-item--danger',
    }
  if (matchAny(id, name, CO_KEYS))
    return {
      type: 'co',
      order: 2,
      iconComp: Wind,
      iconColor: 'text-amber-400',
      css: 'sec-event-item--danger',
    }
  if (matchAny(id, name, LEAK_KEYS))
    return {
      type: 'leak',
      order: 3,
      iconComp: Droplets,
      iconColor: 'text-blue-400',
      css: 'sec-event-item--danger',
    }
  if (matchAny(id, name, DOOR_KEYS))
    return {
      type: 'door',
      order: 4,
      iconComp: DoorOpen,
      iconColor: 'text-sky-400',
      css: 'sec-event-item--sensor',
    }
  if (matchAny(id, name, MOTION_KEYS))
    return {
      type: 'motion',
      order: 5,
      iconComp: Activity,
      iconColor: 'text-yellow-400',
      css: 'sec-event-item--sensor',
    }
  return null
}
/**
 * 对已绑定的危险传感器分类（基于 HazardSensorKind）
 * @param kind 危险传感器种类
 * @returns 分类结果（含类型、排序、图标、颜色、CSS）
 */
function classifyBoundHazard(kind: HazardSensorKind) {
  const type = HAZARD_KIND_TO_TYPE[kind]
  if (type === 'smoke')
    return {
      type,
      order: 0,
      iconComp: Flame,
      iconColor: 'text-red-400',
      css: 'sec-event-item--danger',
    }
  if (type === 'gas')
    return {
      type,
      order: 1,
      iconComp: Wind,
      iconColor: 'text-orange-400',
      css: 'sec-event-item--danger',
    }
  // 水浸类型
  return {
    type,
    order: 3,
    iconComp: Droplets,
    iconColor: 'text-blue-400',
    css: 'sec-event-item--danger',
  }
}

type SensorClassification = ReturnType<typeof classifySensor>

/** 实体名称与未绑定分类缓存（键为实体对象引用，见 sensorInfoFor 注释） */
type EntitySensorInfo = {
  name: string
  sensor: SensorClassification
}
const entitySensorInfoCache = new WeakMap<object, EntitySensorInfo>()

/** 模块级共享：告警确认状态在导航角标与总览间一致 */
const acknowledgedSensorIds = ref(new Set<string>())

/**
 * 安防传感器聚合 composable
 * @returns 全量传感器列表、告警数、告警 Chip、统计卡片、过滤器与操作方法
 */
export function useSecuritySensors() {
  const entitiesStore = useEntitiesStore()
  const layoutStore = useLayoutStore()

  // 危险传感器绑定映射：entity_id -> HazardSensorKind
  const hazardBindingMap = computed(() =>
    buildHazardBindingMap(layoutStore.layoutConfig.haConfig || {}),
  )

  // 全量传感器列表：绑定优先，未绑定按关键字分类
  const allSensors = computed(() => {
    // 触发传感器 domain 与 haConfig 的响应式依赖
    void entitiesStore.getDomainEpoch('binary_sensor')
    void entitiesStore.getDomainEpoch('sensor')
    void layoutStore.layoutConfig.haConfig

    const bindingMap = hazardBindingMap.value
    // toRaw 快照：避免对全量实体逐键建立响应式依赖；失效由显式域 epoch 承担
    const raw = toRaw(entitiesStore.entities)

    /**
     * 解析名称与未绑定分类，按实体对象引用缓存。
     * state-update 每次写入都以新对象整体替换实体，因此同一对象引用必然对应同一份
     * 名称与属性，不会读到旧值；分类/关键字匹配因此只在新实体对象上执行一次。
     */
    function sensorInfoFor(eid: string, entity: (typeof raw)[string]) {
      if (!entity) return { name: getEntityLeaf(eid), sensor: null }
      const cached = entitySensorInfoCache.get(entity)
      if (cached) return cached
      const name = getEntityDisplayName(eid, entity)
      const info: EntitySensorInfo = { name, sensor: classifySensor(eid.toLowerCase(), name) }
      entitySensorInfoCache.set(entity, info)
      return info
    }

    // 去重集合：避免同一实体被绑定与未绑定两次计入
    const seen = new Set<string>()
    const list: Array<{
      entity_id: string
      name: string
      domain: string
      alert: boolean
      type: string
      label: string
      order: number
      iconComp: typeof Flame
      iconColor: string
      css: string
      bound: boolean
      offline: boolean
    }> = []

    /**
     * 推送一个传感器到列表
     * @param eid 实体 ID
     * @param bound 是否为已绑定传感器
     */
    function pushSensor(eid: string, bound: boolean) {
      if (!eid || seen.has(eid)) return
      seen.add(eid)
      const entity = raw[eid]
      // 离线判定：实体不存在或状态为 unavailable
      const offline = !entity || entity.state === 'unavailable'
      const { name, sensor } = sensorInfoFor(eid, entity)
      // 绑定传感器优先用绑定类型分类，否则按关键字分类
      const boundKind = bindingMap.get(eid)
      const cls = boundKind ? classifyBoundHazard(boundKind) : sensor
      // 未分类传感器跳过
      if (!cls) return
      const isAlert = entity ? isSensorAlertState(entity.state) : false
      list.push({
        entity_id: eid,
        name,
        domain: getEntityDomain(eid),
        alert: isAlert,
        type: cls.type,
        label: sensorLabel(cls.type),
        order: cls.order,
        iconComp: cls.iconComp,
        iconColor: cls.iconColor,
        css: cls.css,
        // 绑定标记：显式传入或通过 bindingMap 命中
        bound: bound || !!boundKind,
        offline,
      })
    }

    // 先推送所有绑定传感器，确保排序靠前
    for (const eid of bindingMap.keys()) pushSensor(eid, true)

    // 再推送未绑定的可用传感器
    // 直接扫描实体快照：binary_sensor/sensor 域 epoch 已覆盖其增删改，
    // 不依赖 domainEntityIndex 的异步刷新，避免短暂漏掉新建实体。
    for (const eid of Object.keys(raw)) {
      const domain = getEntityDomain(eid)
      if (domain !== 'binary_sensor' && domain !== 'sensor') continue
      const entity = raw[eid]
      // 跳过离线传感器，避免列表过长
      if (!entity || entity.state === 'unavailable') continue
      pushSensor(eid, false)
    }

    // 排序：绑定优先 > 类型顺序 > 名称（中文 localeCompare）
    return list.sort((a, b) => {
      if (a.bound !== b.bound) return a.bound ? -1 : 1
      if (a.order !== b.order) return a.order - b.order
      return a.name.localeCompare(b.name, 'zh-CN')
    })
  })
  // 告警数：排除已确认的告警
  const alertCount = computed(
    () =>
      allSensors.value.filter((sensor) => sensor.alert && !acknowledgedSensorIds.value.has(sensor.entity_id))
        .length,
  )
  // 告警 Chip：按类型聚合计数
  const activeAlertChips = computed(() => {
    const alerts = allSensors.value.filter(
      (sensor) => sensor.alert && !acknowledgedSensorIds.value.has(sensor.entity_id),
    )
    const byType: Record<string, number> = {}
    for (const alert of alerts) {
      byType[alert.label] = (byType[alert.label] || 0) + 1
    }
    return Object.entries(byType).map(([label, count]) => ({ label, count }))
  })
  // 统计卡片：按类型聚合总数与告警数
  const statCards = computed(() => {
    const cats: Record<
      string,
      {
        key: string
        label: string
        total: number
        alerts: number
        icon: typeof Flame
        color: string
      }
    > = {}
    for (const sensor of allSensors.value) {
      if (!cats[sensor.type]) {
        cats[sensor.type] = {
          key: sensor.type,
          label: sensor.label,
          total: 0,
          alerts: 0,
          icon: sensor.iconComp,
          color: sensor.iconColor,
        }
      }
      cats[sensor.type].total++
      if (sensor.alert) cats[sensor.type].alerts++
    }
    // 按预设类型顺序排序
    return Object.values(cats).sort((a, b) => {
      const order: Record<string, number> = {
        smoke: 0,
        gas: 1,
        co: 2,
        leak: 3,
        door: 4,
        motion: 5,
      }
      return (order[a.key] || 99) - (order[b.key] || 99)
    })
  })
  // 传感器过滤器：每类传感器的数量与告警数
  const sensorFilters = computed(() => {
    const counts: Record<
      string,
      { key: string; label: string; count: number; alertCount: number }
    > = {}
    for (const sensor of allSensors.value) {
      if (!counts[sensor.type]) {
        counts[sensor.type] = { key: sensor.type, label: sensor.label, count: 0, alertCount: 0 }
      }
      counts[sensor.type].count++
      if (sensor.alert) counts[sensor.type].alertCount++
    }
    return Object.values(counts)
  })

  /**
   * 查询单个传感器是否告警
   * @param eid 实体 ID
   * @returns 是否告警；实体不存在时返回 false
   */
  function getSensorAlert(eid: string) {
    const entity = entitiesStore.entities[eid]
    if (!entity) return false
    return isSensorAlertState(entity.state)
  }

  /**
   * 查询单个传感器显示名称
   * @param eid 实体 ID
   * @returns 显示名称
   */
  function getSensorName(eid: string) {
    return getEntityDisplayName(eid, entitiesStore.entities[eid])
  }

  /**
   * 确认全部告警：将当前告警实体 ID 加入已确认集合
   * @sideEffects 更新 acknowledgedSensorIds
   */
  function acknowledgeAllAlerts() {
    const ids = allSensors.value.filter((sensor) => sensor.alert).map((sensor) => sensor.entity_id)
    acknowledgedSensorIds.value = new Set([...acknowledgedSensorIds.value, ...ids])
  }

  return {
    allSensors,
    alertCount,
    activeAlertChips,
    statCards,
    sensorFilters,
    acknowledgedSensorIds,
    getSensorAlert,
    getSensorName,
    acknowledgeAllAlerts,
  }
}