/**
 * Derived 索引 Worker 主线程桥：发起 Worker 重建 / 增量 patch，并把结果回写主线程索引。
 *
 * 关键依赖：comlink（Worker RPC wrap）、@/types/entity-store（派生索引与补丁类型）、
 *   @/utils/core/logger（失败 / 超时告警）。
 *
 * 消息协议（comlink RPC，无 postMessage 显式事件）：
 * - 出站调用 api.rebuildDerivedSnapshot(entities, opts) -> { epoch, snapshot }
 *     全量重建，结果由 applyDerivedSnapshot 写回主线程 derived 索引；
 * - 出站调用 api.patchDerivedSnapshot(patches, { deferSecondary, expectedEpoch }) -> DerivedSnapshotPatch | null
 *     增量补丁，结果由 applyDerivedSnapshotPatch 写回主线程索引；
 * - 通过 appliedEpoch 与 Worker 端 epoch 协同失步校验：失步 / 超时 / 失败时回退主线程全量重建。
 */
import type { Remote } from 'comlink'
import type {
  DerivedBatteryEntry,
  DerivedOfflineEntry,
  DerivedSnapshot,
  DerivedSnapshotPatch,
  DerivedSnapshotTargets,
  DerivedWorkerApi,
  EntitiesMap,
  EntityPatch,
} from '@/types/entity-store'
import { logger } from '@/utils/core/logger'

/**
 * 将 Worker 重建快照全量写回主线程 derived 索引：
 * 覆盖在线 / 灯光 / 气候计数、电池与离线列表、传感器索引、域计数与域实体索引。
 */
export function applyDerivedSnapshot(
  snapshot: DerivedSnapshot,
  targets: DerivedSnapshotTargets,
): void {
  if (!snapshot || !targets) return

  targets.onlineCount.value = snapshot.online ?? 0
  targets.lightCount.value = snapshot.lightCount ?? 0
  targets.climateCount.value = snapshot.climateCount ?? 0

  targets.batteryDevices.splice(0, targets.batteryDevices.length, ...(snapshot.batteryList || []))
  targets.offlineDevices.splice(0, targets.offlineDevices.length, ...(snapshot.offlineList || []))

  targets.sensorIndex.clear()
  for (const [k, v] of Object.entries(snapshot.sensorIndex || {})) {
    targets.sensorIndex.set(k, Array.isArray(v) ? v : [])
  }

  targets.domainCounts.clear()
  for (const [k, v] of Object.entries(snapshot.domainCounts || {})) {
    targets.domainCounts.set(k, v)
  }

  targets.domainEntityIndex.clear()
  for (const [k, v] of Object.entries(snapshot.domainEntityIndex || {})) {
    targets.domainEntityIndex.set(k, new Set(Array.isArray(v) ? v : []))
  }
}

/**
 * 将 Worker 增量 patch 应用到主线程 derived 索引（仅更新受影响域/实体，其余保持不变）。
 * 与 applyDerivedSnapshot 的全量重建相对，patch 路径避免 O(n) 的 clear + 全量 set。
 */
export function applyDerivedSnapshotPatch(
  patch: DerivedSnapshotPatch,
  targets: DerivedSnapshotTargets,
): void {
  if (!patch || !targets) return

  targets.onlineCount.value = patch.counts.online
  targets.lightCount.value = patch.counts.lightCount
  targets.climateCount.value = patch.counts.climateCount

  // 域计数：仅更新受影响域，计数归零时移除该域
  for (const [domain, count] of Object.entries(patch.domainCounts)) {
    if (count > 0) targets.domainCounts.set(domain, count)
    else targets.domainCounts.delete(domain)
  }

  // 域实体索引：仅更新受影响域，实体清空时移除该域
  for (const [domain, ids] of Object.entries(patch.domainEntityIndex)) {
    if (ids.length) targets.domainEntityIndex.set(domain, new Set(ids))
    else targets.domainEntityIndex.delete(domain)
  }

  // 传感器索引：仅更新受影响 sensor 域
  for (const [domain, ids] of Object.entries(patch.sensorIndex)) {
    if (ids.length) targets.sensorIndex.set(domain, ids)
    else targets.sensorIndex.delete(domain)
  }

  // 电池 / 离线列表：按增量增删维护，避免整体重建
  const batteryTarget = targets.batteryDevices as unknown as DerivedBatteryEntry[]
  for (const id of patch.batteryRemoved) {
    const idx = batteryTarget.findIndex((x) => x.entity_id === id)
    if (idx >= 0) batteryTarget.splice(idx, 1)
  }
  batteryTarget.push(...patch.batteryAdded)

  const offlineTarget = targets.offlineDevices as unknown as DerivedOfflineEntry[]
  for (const id of patch.offlineRemoved) {
    const idx = offlineTarget.findIndex((x) => x.entity_id === id)
    if (idx >= 0) offlineTarget.splice(idx, 1)
  }
  offlineTarget.push(...patch.offlineAdded)
}

/** Worker 实例（懒加载，首次成功后复用） */
let worker: Worker | null = null
/** comlink 包装后的 Worker API（暴露 rebuildDerivedSnapshot / patchDerivedSnapshot） */
let workerApi: Remote<DerivedWorkerApi> | null = null
/** Worker 不可用标记：初始化失败或环境不支持时置 true，后续直接回退主线程 */
let workerFailed = false
/** 主线程已应用的最新 Worker 基线版本号（失步校验用） */
let appliedEpoch = 0

/**
 * 使主线程侧 Worker 基线失效（-1）。
 * 主线程索引被非 Worker 路径（主线程重建器 / 重置）直接修改后调用，
 * 强制下一次增量 patch 返回 null 并回退全量重建，避免基线分叉。
 */
export function invalidateDerivedWorkerBaseline(): void {
  appliedEpoch = -1
}

/**
 * 懒加载并复用 entity-derived.worker：环境不支持或初始化失败时标记失败并返回 null，
 * 调用方据此回退主线程计算路径。
 */
async function ensureDerivedWorker(): Promise<Remote<DerivedWorkerApi> | null> {
  if (workerFailed || workerApi) return workerApi
  if (typeof Worker === 'undefined') {
    workerFailed = true
    return null
  }
  try {
    const { wrap } = await import('comlink')
    worker = new Worker(new URL('./entity-derived.worker', import.meta.url), { type: 'module' })
    workerApi = wrap<DerivedWorkerApi>(worker)
    return workerApi
  } catch (err) {
    workerFailed = true
    logger.warn('[实体派生桥] worker 初始化失败,回退主线程', err)
    return null
  }
}

/**
 * 走 Worker 全量重建 derived 索引：带超时竞速，成功后同步主线程基线版本号。
 * Worker 不可用 / 超时 / 异常时返回 null，调用方应回退主线程重建。
 */
export async function rebuildDerivedSnapshotViaWorker(
  entities: EntitiesMap,
  opts: { deferSecondary?: boolean } = {},
  timeoutMs = 500,
): Promise<{ epoch: number; snapshot: DerivedSnapshot } | null> {
  const api = await ensureDerivedWorker()
  if (!api?.rebuildDerivedSnapshot) return null
  try {
    const res = await Promise.race([
      api.rebuildDerivedSnapshot(entities, opts),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Worker 超时')), timeoutMs),
      ),
    ])
    // 重建成功即建立新基线，主线程记录已应用版本
    appliedEpoch = res.epoch
    return res
  } catch (err) {
    logger.warn('[实体派生桥] worker 重建失败', err)
    return null
  }
}

/**
 * 走 Worker 增量 patch derived 索引：传入当前主线程基线版本号失步校验，
 * 带超时竞速；返回 null（失步 / 超时 / 异常）时调用方应回退全量重建。
 */
export async function patchDerivedSnapshotViaWorker(
  patches: EntityPatch[],
  opts: { deferSecondary?: boolean } = {},
  timeoutMs = 400,
): Promise<DerivedSnapshotPatch | null> {
  const api = await ensureDerivedWorker()
  if (!api?.patchDerivedSnapshot) return null
  try {
    const patch = await Promise.race([
      api.patchDerivedSnapshot(patches, {
        deferSecondary: opts.deferSecondary ?? false,
        expectedEpoch: appliedEpoch,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Worker 补丁超时')), timeoutMs),
      ),
    ])
    // 仅同步成功的 patch 版本；失步（null）时保持旧版本，由调用方回退全量重建
    if (patch) appliedEpoch = patch.epoch
    return patch
  } catch (err) {
    logger.warn('[实体派生桥] worker 补丁失败', err)
    return null
  }
}
