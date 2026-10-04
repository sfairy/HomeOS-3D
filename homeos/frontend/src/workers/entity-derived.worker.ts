/**
 * Derived 索引 Worker 端重建 / 增量 patch。
 *
 * 关键依赖：comlink（RPC 暴露）、@/utils/entity/derived.util（累加器与快照转换）、
 *   @homeos/shared（getEntityDomain 解析域）、@/types/entity-store（派生索引类型）。
 *
 * 消息协议（comlink RPC，无 postMessage 显式事件）：
 * - 入站方法 rebuildDerivedSnapshot(entities, opts) -> { epoch, snapshot }
 *     全量重建 derived 索引，建立新基线并自增 epoch，返回 epoch + 全量快照；
 * - 入站方法 patchDerivedSnapshot(patches, { deferSecondary, expectedEpoch }) -> DerivedSnapshotPatch | null
 *     基于已有基线增量应用补丁，返回受影响域/实体的增量片段；失步时返回 null；
 * - 主线程桥 entity-derived-bridge.ts 负责超时控制、基线版本同步与失败回退。
 *
 * 基线策略（T22 真增量优化）：
 * - worker 端维护模块级基线累加器 lastAcc 与版本号 epoch（跨 comlink 调用保留）；
 * - 全量重建（rebuildDerivedSnapshot）建立基线并自增 epoch，返回「epoch + 全量快照」；
 * - 增量 patch（patchDerivedSnapshot）基于 lastAcc 原地 O(p) 应用，仅返回受影响域/实体的
 *   增量变化（DerivedSnapshotPatch），避免「每次全量克隆 + 全量快照往返」的 O(n) 开销；
 * - 无基线（worker 刚启动未重建）或主线程基线失步（expectedEpoch 不匹配）时返回 null，
 *   主线程回退全量重建以重新同步基线。
 */
import { expose } from 'comlink'
import {
  applyEntityDerivedKey,
  removeEntityDerivedKey,
  accFromDerivedSnapshot,
  snapshotFromDerivedAcc,
  type EntityDerivedAccumulator,
} from '@/utils/entity/derived.util'
import { getEntityDomain } from '@homeos/shared'
import type {
  DerivedBatteryEntry,
  DerivedOfflineEntry,
  DerivedSnapshot,
  DerivedSnapshotPatch,
  EntityPatch,
  HaEntityState,
} from '@/types/entity-store'

type DerivedOpts = { deferSecondary?: boolean }

/** 模块级基线累加器（全量重建后建立，增量 patch 基于它原地计算） */
let lastAcc: EntityDerivedAccumulator | null = null
/** 基线版本号：每次 rebuild / patch 成功后自增，主线程据此校验失步 */
let epoch = 0

function rebuildDerivedSnapshot(
  entities: Record<string, HaEntityState>,
  opts: DerivedOpts = {},
): { epoch: number; snapshot: DerivedSnapshot } {
  // 以空快照构造累加器，遍历全部实体逐个累加，建立 Worker 端基线
  const acc = accFromDerivedSnapshot({
    online: 0,
    lightCount: 0,
    climateCount: 0,
    batteryList: [],
    offlineList: [],
    sensorIndex: {},
    domainCounts: {},
    domainEntityIndex: {},
  })
  acc.skipSecondary = opts.deferSecondary ?? false

  for (const key of Object.keys(entities)) {
    applyEntityDerivedKey(key, entities[key], acc)
  }

  // 建立基线，供后续增量 patch 使用
  lastAcc = acc
  epoch++
  return { epoch, snapshot: snapshotFromDerivedAcc(acc) }
}

/**
 * 基于现有基线对实体补丁进行增量更新，仅产出受影响域/实体的增量片段。
 * 失步（无基线或 expectedEpoch 不匹配）时返回 null，触发主线程回退全量重建。
 */
function patchDerivedSnapshot(
  patches: EntityPatch[],
  opts: { deferSecondary?: boolean; expectedEpoch: number } = {
    deferSecondary: false,
    expectedEpoch: -1,
  },
): DerivedSnapshotPatch | null {
  // 无基线（worker 刚启动未全量重建）或主线程基线失步：返回 null，主线程回退全量重建
  if (!lastAcc || epoch !== opts.expectedEpoch) return null

  const acc = lastAcc
  const deferSecondary = opts.deferSecondary ?? false
  acc.skipSecondary = deferSecondary

  // 记录受影响域（域由 entity_id 前缀决定，状态变化不改变域）
  const affectedDomains = new Set<string>()
  // 二级索引（电池 / 离线）patch 前后快照，用于产出增量增删
  const trackSecondary = !deferSecondary
  const batteryBefore = trackSecondary
    ? new Set(acc.batteryList.map((b) => b.entity_id))
    : null
  const offlineBefore = trackSecondary
    ? new Set(acc.offlineList.map((o) => o.entity_id))
    : null

  for (let i = 0; i < patches.length; i++) {
    const { entity_id, oldEntity, newEntity } = patches[i]
    if (!entity_id) continue
    affectedDomains.add(getEntityDomain(entity_id))
    if (oldEntity) removeEntityDerivedKey(entity_id, oldEntity, acc)
    if (newEntity) applyEntityDerivedKey(entity_id, newEntity, acc)
  }

  // 仅携带受影响域的索引片段，其余域保持不变
  const domainCounts: Record<string, number> = {}
  const domainEntityIndex: Record<string, string[]> = {}
  const sensorIndex: Record<string, string[]> = {}
  for (const domain of affectedDomains) {
    const count = acc.domainCounts?.get(domain) ?? 0
    domainCounts[domain] = count
    const set = acc.domainEntityIndex?.get(domain)
    domainEntityIndex[domain] = set ? [...set] : []
    if (domain === 'sensor' || domain === 'binary_sensor') {
      const list = acc.sensorIndex.get(domain)
      sensorIndex[domain] = list ? [...list] : []
    }
  }

  let batteryAdded: DerivedBatteryEntry[] = []
  let batteryRemoved: string[] = []
  let offlineAdded: DerivedOfflineEntry[] = []
  let offlineRemoved: string[] = []
  if (trackSecondary && batteryBefore && offlineBefore) {
    const batteryAfter = new Set(acc.batteryList.map((b) => b.entity_id))
    const offlineAfter = new Set(acc.offlineList.map((o) => o.entity_id))
    batteryAdded = acc.batteryList.filter((b) => !batteryBefore.has(b.entity_id))
    batteryRemoved = [...batteryBefore].filter((id) => !batteryAfter.has(id))
    offlineAdded = acc.offlineList.filter((o) => !offlineBefore.has(o.entity_id))
    offlineRemoved = [...offlineBefore].filter((id) => !offlineAfter.has(id))
  }

  epoch++
  return {
    epoch,
    counts: { online: acc.online, lightCount: acc.lightCount, climateCount: acc.climateCount },
    domainCounts,
    domainEntityIndex,
    sensorIndex,
    batteryAdded,
    batteryRemoved,
    offlineAdded,
    offlineRemoved,
  }
}

// 通过 comlink 暴露 RPC 方法，主线程 entity-derived-bridge.ts 中 wrap 后调用
expose({ rebuildDerivedSnapshot, patchDerivedSnapshot })
