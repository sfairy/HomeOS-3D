/**
 * 实体派生索引绑定（从 entities.store 抽离）
 *
 * 职责：
 * - 维护派生索引：onlineCount / lightCount / climateCount / sensorIndex / domainCounts /
 *   domainEntityIndex / batteryDevices / offlineDevices / cachedDomains / domainEpochs
 * - rebuildDerivedData：全量重建派生索引（按需切换 Worker / 主线程路径）
 * - patchDerivedChanges：增量应用 WS 推送变更（O(p) 而非 O(n)）
 * - scheduleRebuildDerived：debounce 调度全量重建
 * - resetDerivedIndexes：清空所有派生索引并失效 Worker 基线
 * - 页面可见性监听：恢复可见时立即全量重建，避免标签页隐藏期间累积陈旧数据
 *
 * 关键依赖：
 * - @/utils/entity/derived-internals：主线程派生重建器（rebuild / patch）
 * - @/workers/entity-derived-bridge：Worker 派生重建与增量 patch（大实体阈值启用）
 * - @/utils/entity/derived-route.util：路由级 patch 过滤、debounce 倍率、域 epoch 递增
 *
 * 实现说明：
 * - Pinia setup store 无组件实例，不可用 onMounted/onUnmounted；单例 store 生命周期等同应用
 * - Worker 模式下隐藏期间 patchDerivedChanges 被跳过，恢复可见时统一走 rebuildDerivedData()
 *   保证 Worker 基线与主线程索引重新同步
 */
import { ref, reactive } from 'vue'
import { createEntityDerivedRebuilder } from '@/utils/entity/derived-internals'
import {
  applyDerivedSnapshot,
  applyDerivedSnapshotPatch,
  invalidateDerivedWorkerBaseline,
  rebuildDerivedSnapshotViaWorker,
  patchDerivedSnapshotViaWorker,
} from '@/workers/entity-derived-bridge'
import {
  bumpDomainEpochs,
  filterDerivedPatchesForRoute,
  getRouteDerivedDebounceMultiplier,
} from '@/utils/entity/derived-route.util'
import type { DerivedSnapshotTargets, EntityDerivedDeps, EntityPatch } from '@/types/entity-store'

/** 文档是否可见（离屏标签页暂停重计算） */
function isDocumentVisible(): boolean {
  if (typeof document === 'undefined') return true
  return document.visibilityState !== 'hidden'
}

/** 监听文档可见性变化，返回退订函数 */
function onDocumentVisibilityChange(handler: (visible: boolean) => void): () => void {
  if (typeof document === 'undefined') return () => {}
  const fn = () => handler(isDocumentVisible())
  document.addEventListener('visibilitychange', fn)
  return () => document.removeEventListener('visibilitychange', fn)
}

/**
 * 创建派生索引状态与重建/patch API
 * @param deps 依赖注入对象（getEntities / 各种阈值回调 / batteryDevices / offlineDevices / 完成回调）
 * @returns derivedEpoch / cachedDomains / 各类派生索引 + rebuildDerivedData / scheduleRebuildDerived / patchDerivedChanges 等
 */
export function createStoreDerivedState(deps: EntityDerivedDeps) {
  // 派生索引 epoch：每次完成重建或 patch 时递增，供 UI 按域订阅感知变化
  const derivedEpoch = ref(0)
  // 域列表缓存（由 domainCounts 派生，避免 domains getter O(n) 遍历）
  const cachedDomains = ref<string[]>([])
  // 在线设备总数（domainCounts 之外的派生索引）
  const onlineCount = ref(0)
  // 灯设备总数
  const lightCount = ref(0)
  // 空调设备总数
  const climateCount = ref(0)
  // 传感器索引：domain → entity_id 数组
  const sensorIndex = new Map<string, string[]>()
  // 域计数：domain → 实体数
  const domainCounts = new Map<string, number>()
  // 域实体索引：domain → entity_id Set（用于按域快速遍历）
  const domainEntityIndex = new Map<string, Set<string>>()
  // 域 epoch：domain → 最近变更版本（响应式，供 UI 按域订阅）
  const domainEpochs = reactive(new Map<string, number>())

  // 主线程派生重建器：rebuild / patch / 进度查询
  const derivedRebuilder = createEntityDerivedRebuilder({
    getEntities: deps.getEntities,
    getChunkSize: deps.getChunkSize,
    getRebuildDebounceMs: () => {
      const base = deps.getRebuildDebounceMs?.() ?? 80
      return Math.round(base * getRouteDerivedDebounceMultiplier())
    },
    getPatchDebounceMs: () => {
      const base = deps.getPatchDebounceMs?.() ?? deps.getRebuildDebounceMs?.() ?? 50
      return Math.round(base * getRouteDerivedDebounceMultiplier())
    },
    getDeferSecondaryIndexes: deps.getDeferSecondaryIndexes,
    batteryDevices: deps.batteryDevices as unknown as Parameters<
      typeof createEntityDerivedRebuilder
    >[0]['batteryDevices'],
    offlineDevices: deps.offlineDevices as unknown as Parameters<
      typeof createEntityDerivedRebuilder
    >[0]['offlineDevices'],
    onlineCount,
    lightCount,
    climateCount,
    sensorIndex,
    domainCounts,
    domainEntityIndex,
    onProgress: deps.onProgress,
    onComplete: () => {
      derivedEpoch.value++
      deps.onDerivedComplete?.()
      cachedDomains.value = [...domainCounts.keys()].sort()
    },
    onSecondaryComplete: () => {
      derivedEpoch.value++
      deps.onSecondaryComplete?.()
    },
  })

  // Worker 派生快照目标对象：applyDerivedSnapshot / applyDerivedSnapshotPatch 写入目标
  const snapshotTargets: DerivedSnapshotTargets = {
    onlineCount,
    lightCount,
    climateCount,
    sensorIndex,
    domainCounts,
    domainEntityIndex,
    batteryDevices: deps.batteryDevices,
    offlineDevices: deps.offlineDevices,
  }

  /**
   * 通过 Worker 全量重建派生索引。
   * - Worker 不可用（返回 null）或异常时回退主线程全量重建并失效 Worker 基线
   * - 成功时将 Worker 返回的快照一次性应用到 snapshotTargets
   */
  async function rebuildDerivedDataViaWorker(): Promise<void> {
    try {
      const res = await rebuildDerivedSnapshotViaWorker(deps.getEntities(), {
        deferSecondary: deps.getDeferSecondaryIndexes?.() ?? false,
      })
      if (!res) {
        // Worker 不可用：失效基线并回退主线程全量重建，避免后续 patch 基于失步基线
        invalidateDerivedWorkerBaseline()
        derivedRebuilder.rebuildDerivedData()
        return
      }
      applyDerivedSnapshot(res.snapshot, snapshotTargets)
      derivedEpoch.value++
      deps.onDerivedComplete?.()
      cachedDomains.value = [...domainCounts.keys()].sort()
    } catch {
      invalidateDerivedWorkerBaseline()
      derivedRebuilder.rebuildDerivedData()
    }
  }

  /**
   * 全量重建派生索引（自动选择 Worker / 主线程路径）。
   * Worker 阈值达到时优先走 Worker，否则主线程同步重建。
   */
  function rebuildDerivedData(): void {
    if (deps.getUseWorkerDerived?.()) {
      void rebuildDerivedDataViaWorker()
      return
    }
    derivedRebuilder.rebuildDerivedData()
  }

  // debounce 重建定时器：合并高频 WS 推送为一次重建
  let storeRebuildTimer: ReturnType<typeof setTimeout> | null = null
  /**
   * 调度一次去抖的全量重建。
   * debounce 倍率由当前路由决定（如户型图路由需要更短的 debounce）。
   */
  function scheduleRebuildDerived(): void {
    const debounceMs = Math.round(
      (deps.getRebuildDebounceMs?.() ?? 80) * getRouteDerivedDebounceMultiplier(),
    )
    if (storeRebuildTimer) clearTimeout(storeRebuildTimer)
    storeRebuildTimer = setTimeout(() => {
      storeRebuildTimer = null
      rebuildDerivedData()
    }, debounceMs)
  }

  /** 清空所有派生索引并失效 Worker 基线（清空实体 / 重连场景调用） */
  function resetDerivedIndexes(): void {
    onlineCount.value = 0
    lightCount.value = 0
    climateCount.value = 0
    derivedEpoch.value = 0
    sensorIndex.clear()
    domainCounts.clear()
    domainEntityIndex.clear()
    cachedDomains.value = []
    // 主线程索引已清空，失效 Worker 基线，强制下次先全量重建再增量
    invalidateDerivedWorkerBaseline()
  }

  /**
   * B7: 从 domainCounts 同步缓存域列表。
   * domainCounts 由派生增量 patch 维护（域数远小于实体数），避免 domains getter 在缓存未就绪时 O(n) 回退遍历
   */
  function refreshCachedDomains(): void {
    cachedDomains.value = [...domainCounts.keys()].sort()
  }

  /**
   * 增量应用 WS 推送的状态变更到派生索引。
   * - 域 epoch 始终递增（含被跳过派生重建的 sensor 等），供 UI 按域订阅
   * - 离屏时跳过 patch（恢复可见时由 visibility 监听触发全量重建）
   * - 经路由级过滤后调用 Worker patch（首选）或主线程 patch
   * - Worker 失败 / 无基线时失效基线并回退主线程 patch，避免主线程与 Worker 索引分叉
   * @param changes 状态变更列表
   */
  function patchDerivedChanges(changes: EntityPatch[]): void {
    // 域 epoch 始终递增（含 Dashboard 上被跳过派生重建的 sensor 等），供 UI 按域订阅
    bumpDomainEpochs(domainEpochs, changes)
    if (!isDocumentVisible()) return
    const filtered = filterDerivedPatchesForRoute(changes) as EntityPatch[]
    if (!filtered?.length) return

    if (deps.getUseWorkerDerived?.()) {
      void (async () => {
        try {
          const patch = await patchDerivedSnapshotViaWorker(filtered, {
            deferSecondary: deps.getDeferSecondaryIndexes?.() ?? false,
          })
          if (patch) {
            // 增量应用：仅更新受影响域/实体，其余索引保持不变（O(p) 而非 O(n)）
            applyDerivedSnapshotPatch(patch, snapshotTargets)
            derivedEpoch.value++
            deps.onDerivedComplete?.()
            refreshCachedDomains()
            return
          }
        } catch {
          /* 回退 */
        }
        // Worker 无基线 / 失步 / 失败：失效基线并回退主线程增量 patch，
        // 保证主线程索引与 Worker 基线不同时演进，避免下次 patch 分叉
        invalidateDerivedWorkerBaseline()
        derivedRebuilder.patchDerivedChanges(filtered)
        refreshCachedDomains()
      })()
      return
    }
    derivedRebuilder.patchDerivedChanges(filtered)
    refreshCachedDomains()
  }

  // Pinia setup store 无组件实例，不可用 onMounted/onUnmounted；单例 store 生命周期等同应用
  // 隐藏期间 patchDerivedChanges 被跳过，派生索引会陈旧；恢复可见时立即（非 debounce）全量重建，
  // 避免返回标签页后 80ms+ 内域列表/自动发现/户型图 epoch 仍显示旧数据。
  // Worker 模式下统一走 rebuildDerivedData()（Worker 全量重建优先），
  // 保证 Worker 基线 lastAcc/epoch 与主线程索引重新同步，后续增量 patch 可持续。
  onDocumentVisibilityChange((visible) => {
    if (visible) rebuildDerivedData()
  })

  return {
    derivedEpoch,
    cachedDomains,
    onlineCount,
    lightCount,
    climateCount,
    sensorIndex,
    domainCounts,
    domainEntityIndex,
    domainEpochs,
    getDomainEpoch: (domain: string) => domainEpochs.get(domain) || 0,
    derivedRebuilder,
    resetDerivedIndexes,
    rebuildDerivedData,
    scheduleRebuildDerived,
    patchDerivedChanges,
  }
}
