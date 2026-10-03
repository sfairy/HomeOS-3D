/**
 * @module entity-derived-internals
 * @description 实体派生数据：key 索引 + 重建器。
 *
 * 职责：
 * - 维护实体派生累加器（在线数 / 灯数 / 空调数 / 电池列表 / 离线列表 / 传感器索引 / 域计数）。
 * - 提供全量分片重建（基于 requestIdleCallback 分片执行，避免阻塞主线程）。
 * - 提供增量 patch（单实体新增 / 移除，合并 debounce 后批量应用）。
 * - 支持延迟二级索引（电池 / 离线 / 传感器）重建，优先保证主计数快速就绪。
 *
 * 依赖：`@homeos/shared` 提供 getEntityDomain。
 */
import type { DerivedSnapshot, EntitiesMap, HaEntityState, HaEntityView } from '@/types/entity-store'
import { getEntityDomain } from '@homeos/shared'

/**
 * 电池设备条目：电量低于 30% 的设备信息。
 */
interface BatteryDeviceEntry {
  entity_id: string
  name: string
  level: number
  domain: string
}

/**
 * 离线设备条目：state 为 unavailable 的设备信息。
 */
interface OfflineDeviceEntry {
  entity_id: string
  name: string
  domain: string
  last_changed: string
}

/**
 * 实体派生累加器。
 *
 * 在全量重建与增量 patch 中作为可变中间状态，收集各项派生指标。
 * - batteryById / offlineById：存在时以 Map 维护，便于增量 patch 快速查找删除；
 *   不存在时直接操作列表（全量重建场景）。
 * - skipSecondary：为 true 时跳过电池 / 离线 / 传感器二级索引，仅更新主计数。
 */
export interface EntityDerivedAccumulator {
  online: number
  lightCount: number
  climateCount: number
  batteryList: BatteryDeviceEntry[]
  offlineList: OfflineDeviceEntry[]
  sensorIndex: Map<string, string[]>
  domainCounts?: Map<string, number>
  domainEntityIndex?: Map<string, Set<string>>
  batteryById?: Map<string, BatteryDeviceEntry>
  offlineById?: Map<string, OfflineDeviceEntry>
  skipSecondary?: boolean
}

/**
 * Worker / 主线程共用：从可序列化快照恢复累加器。
 *
 * 将 DerivedSnapshot 中的普通对象还原为 Map 结构，便于后续增量操作。
 *
 * @param snap 可序列化的派生快照。
 * @returns 恢复后的累加器。
 */
export function accFromDerivedSnapshot(snap: DerivedSnapshot): EntityDerivedAccumulator {
  const sensorIndex = new Map<string, string[]>()
  for (const [k, v] of Object.entries(snap.sensorIndex || {})) {
    sensorIndex.set(k, Array.isArray(v) ? [...v] : [])
  }
  const domainCounts = new Map<string, number>()
  for (const [k, v] of Object.entries(snap.domainCounts || {})) {
    domainCounts.set(k, typeof v === 'number' ? v : 0)
  }
  const domainEntityIndex = new Map<string, Set<string>>()
  for (const [k, v] of Object.entries(snap.domainEntityIndex || {})) {
    domainEntityIndex.set(k, new Set(Array.isArray(v) ? v : []))
  }
  return {
    online: snap.online ?? 0,
    lightCount: snap.lightCount ?? 0,
    climateCount: snap.climateCount ?? 0,
    batteryList: [...((snap.batteryList || []) as unknown as BatteryDeviceEntry[])],
    offlineList: [...((snap.offlineList || []) as unknown as OfflineDeviceEntry[])],
    sensorIndex,
    domainCounts,
    domainEntityIndex,
    skipSecondary: false,
  }
}

/**
 * Worker / 主线程共用：累加器转可序列化快照。
 *
 * 将 Map 结构序列化为普通对象，便于跨线程传递（structured clone）。
 *
 * @param acc 累加器。
 * @returns 可序列化的派生快照。
 */
export function snapshotFromDerivedAcc(acc: EntityDerivedAccumulator): DerivedSnapshot {
  return {
    online: acc.online,
    lightCount: acc.lightCount,
    climateCount: acc.climateCount,
    batteryList: acc.batteryList as unknown as HaEntityState[],
    offlineList: acc.offlineList as unknown as HaEntityState[],
    domainCounts: Object.fromEntries(acc.domainCounts || []),
    domainEntityIndex: Object.fromEntries(
      [...(acc.domainEntityIndex || new Map()).entries()].map(([k, v]) => [k, [...v]]),
    ),
    sensorIndex: Object.fromEntries([...acc.sensorIndex.entries()].map(([k, v]) => [k, [...v]])),
  }
}

/**
 * 判断实体是否配置了 HA friendly_name 属性。
 *
 * @param entity 实体状态。
 * @returns 存在 friendly_name 返回 true，否则返回 false。
 */
export function hasEntityFriendlyName(entity: HaEntityView | null | undefined): boolean {
  // eslint-disable-next-line no-restricted-syntax -- 规范实现
  return Boolean(entity?.attributes?.friendly_name)
}

/**
 * 折叠「整段重复」的展示名（如 HA friendly_name 写成「HUAWEI Mate X5 HUAWEI Mate X5」）。
 * 仅处理对半完全相同的情况，避免误伤正常长短语。
 */
function collapseRepeatedDisplayName(name: string): string {
  const t = String(name || '').trim().replace(/\s+/g, ' ')
  if (!t) return ''
  const parts = t.split(' ')
  if (parts.length < 2 || parts.length % 2 !== 0) return t
  const half = parts.length / 2
  const a = parts.slice(0, half).join(' ')
  const b = parts.slice(half).join(' ')
  return a && a === b ? a : t
}

/**
 * 获取实体展示名：优先 friendly_name，否则取 entity_id 的后缀（domain 之后部分）。
 *
 * @param entityId 实体 ID。
 * @param entity 实体状态。
 * @returns 展示名；entityId 为空时返回空字符串。
 */
export function getEntityDisplayName(
  entityId: string,
  entity: HaEntityView | null | undefined,
): string {
  if (!entityId) return ''
  // eslint-disable-next-line no-restricted-syntax -- 规范实现
  const raw = entity?.attributes?.friendly_name || entityId.split('.')[1] || entityId
  return collapseRepeatedDisplayName(String(raw))
}

/**
 * 将单个实体应用到派生累加器（增量新增 / 全量重建共用）。
 *
 * 处理内容：
 * - 更新域计数与域实体索引。
 * - skipSecondary 为 true 时仅更新在线数 / 灯数 / 空调数，跳过电池 / 离线 / 传感器索引。
 * - 否则：在线实体更新计数并收集低电量设备；离线实体加入离线列表；
 *   sensor / binary_sensor 加入传感器索引。
 *
 * @param key 实体 ID。
 * @param e 实体状态。
 * @param acc 派生累加器（会被原地修改）。
 */
export function applyEntityDerivedKey(
  key: string,
  e: HaEntityState | undefined,
  acc: EntityDerivedAccumulator,
): void {
  if (!e) return

  const domain = getEntityDomain(key)
  if (acc.domainCounts) {
    acc.domainCounts.set(domain, (acc.domainCounts.get(domain) || 0) + 1)
  }
  if (acc.domainEntityIndex) {
    let set = acc.domainEntityIndex.get(domain)
    if (!set) {
      set = new Set<string>()
      acc.domainEntityIndex.set(domain, set)
    }
    set.add(key)
  }

  if (acc.skipSecondary) {
    if (e.state !== 'unavailable') {
      acc.online++
      if (key.startsWith('light.') && e.state === 'on') acc.lightCount++
      if (key.startsWith('climate.') && e.state !== 'off') acc.climateCount++
    }
    return
  }

  if (e.state !== 'unavailable') {
    acc.online++
    const bat = e.attributes?.battery_level ?? e.attributes?.battery
    if (bat !== undefined && bat !== null) {
      const lvl = typeof bat === 'number' ? bat : parseInt(String(bat), 10)
      if (!isNaN(lvl) && lvl <= 30) {
        const item: BatteryDeviceEntry = {
          entity_id: key,
          name: getEntityDisplayName(key, e),
          level: lvl,
          domain,
        }
        if (acc.batteryById) acc.batteryById.set(key, item)
        else acc.batteryList.push(item)
      }
    }
    if (key.startsWith('light.') && e.state === 'on') acc.lightCount++
    if (key.startsWith('climate.') && e.state !== 'off') acc.climateCount++
  } else {
    const item: OfflineDeviceEntry = {
      entity_id: key,
      name: getEntityDisplayName(key, e),
      domain,
      last_changed: e.last_changed || '',
    }
    if (acc.offlineById) acc.offlineById.set(key, item)
    else acc.offlineList.push(item)
  }

  if (domain === 'sensor' || domain === 'binary_sensor') {
    const existingIds = acc.sensorIndex.get(domain) || []
    existingIds.push(key)
    acc.sensorIndex.set(domain, existingIds)
  }
}

/**
 * 从派生累加器中移除单个实体（增量 patch 用）。
 *
 * 与 applyEntityDerivedKey 对称，反向撤销各项计数与索引。
 * 计数使用 Math.max(0, ...) 保护，避免负数。
 *
 * @param key 实体 ID。
 * @param e 实体状态（旧状态）。
 * @param acc 派生累加器（会被原地修改）。
 */
export function removeEntityDerivedKey(
  key: string,
  e: HaEntityState | undefined,
  acc: EntityDerivedAccumulator,
): void {
  if (!e) return

  const domain = getEntityDomain(key)
  if (acc.domainCounts) {
    const next = (acc.domainCounts.get(domain) || 0) - 1
    if (next <= 0) acc.domainCounts.delete(domain)
    else acc.domainCounts.set(domain, next)
  }
  if (acc.domainEntityIndex) {
    const set = acc.domainEntityIndex.get(domain)
    if (set) {
      set.delete(key)
      if (!set.size) acc.domainEntityIndex.delete(domain)
    }
  }

  if (acc.skipSecondary) {
    if (e.state !== 'unavailable') {
      acc.online = Math.max(0, acc.online - 1)
      if (key.startsWith('light.') && e.state === 'on')
        acc.lightCount = Math.max(0, acc.lightCount - 1)
      if (key.startsWith('climate.') && e.state !== 'off')
        acc.climateCount = Math.max(0, acc.climateCount - 1)
    }
    return
  }

  if (e.state !== 'unavailable') {
    acc.online = Math.max(0, acc.online - 1)
    const bat = e.attributes?.battery_level ?? e.attributes?.battery
    if (bat !== undefined && bat !== null) {
      const lvl = typeof bat === 'number' ? bat : parseInt(String(bat), 10)
      if (!isNaN(lvl) && lvl <= 30) {
        if (acc.batteryById) {
          acc.batteryById.delete(key)
        } else {
          const idx = acc.batteryList.findIndex((x) => x.entity_id === key)
          if (idx >= 0) acc.batteryList.splice(idx, 1)
        }
      }
    }
    if (key.startsWith('light.') && e.state === 'on')
      acc.lightCount = Math.max(0, acc.lightCount - 1)
    if (key.startsWith('climate.') && e.state !== 'off')
      acc.climateCount = Math.max(0, acc.climateCount - 1)
  } else {
    if (acc.offlineById) {
      acc.offlineById.delete(key)
    } else {
      const idx = acc.offlineList.findIndex((x) => x.entity_id === key)
      if (idx >= 0) acc.offlineList.splice(idx, 1)
    }
  }

  if (domain === 'sensor' || domain === 'binary_sensor') {
    const list = acc.sensorIndex.get(domain)
    if (list) {
      const idx = list.indexOf(key)
      if (idx >= 0) list.splice(idx, 1)
      if (!list.length) acc.sensorIndex.delete(domain)
    }
  }
}

interface IdleDeadline {
  timeRemaining(): number
}

/** 单实体的派生变更 patch：包含旧状态与新状态。 */
interface EntityDerivedPatch {
  oldEntity: HaEntityState | null
  newEntity: HaEntityState | null
}

/**
 * 实体派生重建器的依赖集合。
 *
 * 提供实体数据源、分片大小、各项派生指标的容器、回调钩子，
 * 以及 requestIdleCallback / requestAnimationFrame 的可注入实现（便于测试）。
 */
interface EntityDerivedRebuilderDeps {
  getEntities: () => EntitiesMap
  getChunkSize: () => number
  batteryDevices: BatteryDeviceEntry[]
  offlineDevices: OfflineDeviceEntry[]
  onlineCount: { value: number }
  lightCount: { value: number }
  climateCount: { value: number }
  sensorIndex: Map<string, string[]>
  domainCounts?: Map<string, number>
  domainEntityIndex?: Map<string, Set<string>>
  onProgress?: () => void
  onComplete?: () => void
  onSecondaryComplete?: () => void
  getDeferSecondaryIndexes?: () => boolean
  getRebuildDebounceMs?: () => number
  getPatchDebounceMs?: () => number
  requestIdleCallback?: (fn: (deadline: IdleDeadline) => void) => void
  requestAnimationFrame?: (fn: () => void) => number
}

/**
 * 创建实体派生数据重建器。
 *
 * 内部维护全量重建与增量 patch 两套机制：
 * - 全量重建：分片遍历所有实体，基于 requestIdleCallback 避免阻塞主线程；
 *   支持延迟二级索引（先完成主计数，再 idle 时补全电池 / 离线 / 传感器索引）。
 * - 增量 patch：收集单实体变更，合并 debounce 后批量应用，
 *   使用 batteryById / offlineById Map 加速查找删除。
 *
 * 返回的方法：
 * - rebuildDerivedData：立即触发全量重建（清除 pending patch）。
 * - scheduleRebuildDerived：debounce 触发全量重建。
 * - patchDerivedChanges：提交增量变更（合并 debounce）。
 * - schedulePatchDerived：触发增量 patch 刷新。
 * - getRebuildProgress：获取当前重建进度。
 *
 * @param deps 依赖对象，提供实体数据、配置、回调等。
 * @returns 重建器方法集合。
 */
export function createEntityDerivedRebuilder(deps: EntityDerivedRebuilderDeps) {
  const ric =
    deps.requestIdleCallback ??
    ((fn: (deadline: IdleDeadline) => void) => {
      fn({ timeRemaining: () => 50 })
    })
  const raf =
    deps.requestAnimationFrame ??
    ((fn: () => void) => {
      fn()
      return 0
    })

  let rebuildChunkIndex = 0
  let rebuildKeys: string[] = []
  let rebuildBatteryList: BatteryDeviceEntry[] = []
  let rebuildOfflineList: OfflineDeviceEntry[] = []
  let rebuildOnline = 0
  let rebuildLightCount = 0
  let rebuildClimateCount = 0
  let rebuildDerivedScheduled = false
  let rebuildDerivedTimer: ReturnType<typeof setTimeout> | null = null
  let patchDerivedTimer: ReturnType<typeof setTimeout> | null = null
  let secondaryRebuildScheduled = false
  let secondaryChunkIndex = 0
  let secondaryKeys: string[] = []
  let pendingPatches = new Map<string, EntityDerivedPatch>()

  /**
   * 提交重建结果到依赖容器。
   *
   * 将本轮重建的在线数 / 灯数 / 空调数 / 电池列表 / 离线列表写回 deps，
   * 并触发 onComplete 或 onSecondaryComplete 回调。
   *
   * @param options.secondaryOnly 是否仅提交二级索引结果（主计数已提前提交）。
   */
  function commitResults({ secondaryOnly = false }: { secondaryOnly?: boolean } = {}) {
    if (!secondaryOnly) {
      deps.onlineCount.value = rebuildOnline
      deps.lightCount.value = rebuildLightCount
      deps.climateCount.value = rebuildClimateCount
    }
    deps.batteryDevices.splice(0, deps.batteryDevices.length, ...rebuildBatteryList)
    deps.offlineDevices.splice(0, deps.offlineDevices.length, ...rebuildOfflineList)
    rebuildDerivedScheduled = false
    if (secondaryOnly) deps.onSecondaryComplete?.()
    else deps.onComplete?.()
  }

  /**
   * 调度二级索引重建（电池 / 离线 / 传感器）。
   *
   * 在主计数就绪后通过 requestIdleCallback 延迟执行，避免阻塞用户交互。
   */
  function scheduleSecondaryRebuild() {
    if (secondaryRebuildScheduled) return
    secondaryRebuildScheduled = true
    rebuildBatteryList = []
    rebuildOfflineList = []
    deps.sensorIndex.clear()
    secondaryChunkIndex = 0
    secondaryKeys = []
    ric((deadline) => {
      secondaryRebuildScheduled = false
      rebuildSecondaryIndexes(deadline)
    })
  }

  /**
   * 分片重建二级索引。
   *
   * 遍历实体列表，在 idle deadline 允许的范围内处理一个分片；
   * 未完成时继续调度下一片，完成后提交二级索引结果。
   *
   * @param deadline idle 回调截止时间。
   */
  function rebuildSecondaryIndexes(deadline: IdleDeadline) {
    if (!secondaryKeys.length) secondaryKeys = Object.keys(deps.getEntities())
    const rawEntities = deps.getEntities()
    const chunkSize = deps.getChunkSize()
    const endIdx = Math.min(secondaryChunkIndex + chunkSize, secondaryKeys.length)

    while (secondaryChunkIndex < endIdx && deadline.timeRemaining() > 1) {
      const key = secondaryKeys[secondaryChunkIndex]
      secondaryChunkIndex++
      const e = rawEntities[key]
      if (!e) continue
      const domain = getEntityDomain(key)
      if (e.state !== 'unavailable') {
        const bat = e.attributes?.battery_level ?? e.attributes?.battery
        if (bat !== undefined && bat !== null) {
          const lvl = typeof bat === 'number' ? bat : parseInt(String(bat), 10)
          if (!isNaN(lvl) && lvl <= 30) {
            rebuildBatteryList.push({
              entity_id: key,
              name: getEntityDisplayName(key, e),
              level: lvl,
              domain,
            })
          }
        }
      } else {
        rebuildOfflineList.push({
          entity_id: key,
          name: getEntityDisplayName(key, e),
          domain,
          last_changed: e.last_changed || '',
        })
      }
      if (domain === 'sensor' || domain === 'binary_sensor') {
        const existingIds = deps.sensorIndex.get(domain) || []
        existingIds.push(key)
        deps.sensorIndex.set(domain, existingIds)
      }
    }

    if (secondaryChunkIndex < secondaryKeys.length) {
      ric(rebuildSecondaryIndexes)
      return
    }
    secondaryChunkIndex = 0
    secondaryKeys = []
    commitResults({ secondaryOnly: true })
  }

  /**
   * 分片处理全量重建。
   *
   * 在 idle deadline 允许的范围内处理一个分片，应用 applyEntityDerivedKey；
   * 未完成时继续调度下一片，完成后提交结果并按需触发二级索引重建。
   *
   * @param deadline idle 回调截止时间。
   */
  function processRebuildChunk(deadline: IdleDeadline) {
    const rawEntities = deps.getEntities()
    const chunkSize = deps.getChunkSize()
    const endIdx = Math.min(rebuildChunkIndex + chunkSize, rebuildKeys.length)
    const deferSecondary = deps.getDeferSecondaryIndexes?.() ?? false
    const acc: EntityDerivedAccumulator = {
      online: rebuildOnline,
      lightCount: rebuildLightCount,
      climateCount: rebuildClimateCount,
      batteryList: rebuildBatteryList,
      offlineList: rebuildOfflineList,
      sensorIndex: deps.sensorIndex,
      domainCounts: deps.domainCounts,
      domainEntityIndex: deps.domainEntityIndex,
      skipSecondary: deferSecondary,
    }

    while (rebuildChunkIndex < endIdx && deadline.timeRemaining() > 1) {
      const key = rebuildKeys[rebuildChunkIndex]
      applyEntityDerivedKey(key, rawEntities[key], acc)
      rebuildChunkIndex++
    }

    rebuildOnline = acc.online
    rebuildLightCount = acc.lightCount
    rebuildClimateCount = acc.climateCount

    if (rebuildChunkIndex < rebuildKeys.length) {
      deps.onProgress?.()
      ric(processRebuildChunk)
    } else {
      commitResults()
      if (deferSecondary) scheduleSecondaryRebuild()
    }
  }

  /**
   * 立即执行全量重建。
   *
   * 清除 pending patch，重置各项累加器，按实体数量决定同步处理或分片调度。
   */
  function rebuildDerivedData() {
    if (patchDerivedTimer) {
      clearTimeout(patchDerivedTimer)
      patchDerivedTimer = null
    }
    pendingPatches.clear()

    rebuildKeys = Object.keys(deps.getEntities())
    rebuildChunkIndex = 0
    rebuildBatteryList = []
    rebuildOfflineList = []
    rebuildOnline = 0
    rebuildLightCount = 0
    rebuildClimateCount = 0
    if (!(deps.getDeferSecondaryIndexes?.() ?? false)) {
      deps.sensorIndex.clear()
    }
    deps.domainCounts?.clear()
    deps.domainEntityIndex?.clear()

    if (rebuildKeys.length <= deps.getChunkSize()) {
      processRebuildChunk({ timeRemaining: () => 50 })
    } else {
      ric(processRebuildChunk)
    }
  }

  /**
   * 刷新待处理的增量 patch。
   *
   * 取出 pendingPatches，构建带 batteryById / offlineById Map 的累加器，
   * 逐个应用 remove + apply，最后将列表回写并触发 onComplete。
   */
  function flushPendingPatches() {
    patchDerivedTimer = null
    if (!pendingPatches.size) return

    const patches = pendingPatches
    pendingPatches = new Map<string, EntityDerivedPatch>()

    const acc: EntityDerivedAccumulator = {
      online: deps.onlineCount.value,
      lightCount: deps.lightCount.value,
      climateCount: deps.climateCount.value,
      batteryList: deps.batteryDevices,
      offlineList: deps.offlineDevices,
      batteryById: new Map(deps.batteryDevices.map((d) => [d.entity_id, d])),
      offlineById: new Map(deps.offlineDevices.map((d) => [d.entity_id, d])),
      sensorIndex: deps.sensorIndex,
      domainCounts: deps.domainCounts,
      domainEntityIndex: deps.domainEntityIndex,
    }

    for (const [entityId, { oldEntity, newEntity }] of patches) {
      if (oldEntity) removeEntityDerivedKey(entityId, oldEntity, acc)
      if (newEntity) applyEntityDerivedKey(entityId, newEntity, acc)
    }

    if (acc.batteryById) {
      deps.batteryDevices.splice(0, deps.batteryDevices.length, ...acc.batteryById.values())
    }
    if (acc.offlineById) {
      deps.offlineDevices.splice(0, deps.offlineDevices.length, ...acc.offlineById.values())
    }

    deps.onlineCount.value = acc.online
    deps.lightCount.value = acc.lightCount
    deps.climateCount.value = acc.climateCount
    deps.onComplete?.()
  }

  /**
   * 批量增量更新派生索引 / 计数（合并 debounce）。
   *
   * 将变更合并到 pendingPatches（同一实体取最早的 oldEntity 与最新的 newEntity），
   * 然后调度 debounce 刷新。避免短时间内大量 WS 事件触发重复重建。
   *
   * @param changes 实体变更数组。
   */
  function patchDerivedChanges(
    changes: Array<{
      entity_id: string
      oldEntity: HaEntityState | null
      newEntity: HaEntityState | null
    }>,
  ) {
    if (!changes?.length) return
    for (let i = 0; i < changes.length; i++) {
      const { entity_id, oldEntity, newEntity } = changes[i]
      if (!entity_id) continue
      const prev = pendingPatches.get(entity_id)
      pendingPatches.set(entity_id, {
        oldEntity: prev?.oldEntity ?? oldEntity,
        newEntity,
      })
    }
    schedulePatchDerived()
  }

  /**
   * 调度增量 patch 刷新（debounce）。
   *
   * 根据 getPatchDebounceMs 决定延迟时长；<= 0 时立即刷新。
   */
  function schedulePatchDerived() {
    const debounceMs = deps.getPatchDebounceMs?.() ?? deps.getRebuildDebounceMs?.() ?? 50
    if (debounceMs <= 0) {
      if (patchDerivedTimer) {
        clearTimeout(patchDerivedTimer)
        patchDerivedTimer = null
      }
      flushPendingPatches()
      return
    }
    if (patchDerivedTimer) clearTimeout(patchDerivedTimer)
    patchDerivedTimer = setTimeout(flushPendingPatches, debounceMs)
  }

  /**
   * 调度全量重建（debounce）。
   *
   * 根据 getRebuildDebounceMs 决定延迟时长；<= 0 时通过 requestAnimationFrame 触发。
   */
  function scheduleRebuildDerived() {
    const debounceMs = deps.getRebuildDebounceMs?.() ?? 80
    if (debounceMs <= 0) {
      if (rebuildDerivedTimer) {
        clearTimeout(rebuildDerivedTimer)
        rebuildDerivedTimer = null
      }
      if (!rebuildDerivedScheduled) {
        rebuildDerivedScheduled = true
        raf(() => {
          rebuildDerivedScheduled = false
          rebuildDerivedData()
        })
      }
      return
    }
    if (rebuildDerivedTimer) clearTimeout(rebuildDerivedTimer)
    rebuildDerivedTimer = setTimeout(() => {
      rebuildDerivedTimer = null
      rebuildDerivedScheduled = false
      rebuildDerivedData()
    }, debounceMs)
  }

  /**
   * 获取当前全量重建进度。
   *
   * @returns 包含 index / total / ratio 的进度对象。
   */
  function getRebuildProgress() {
    if (!rebuildKeys.length) return { index: 0, total: 0, ratio: 1 }
    return {
      index: rebuildChunkIndex,
      total: rebuildKeys.length,
      ratio: rebuildChunkIndex / rebuildKeys.length,
    }
  }

  return {
    rebuildDerivedData,
    scheduleRebuildDerived,
    patchDerivedChanges,
    schedulePatchDerived,
    getRebuildProgress,
  }
}
