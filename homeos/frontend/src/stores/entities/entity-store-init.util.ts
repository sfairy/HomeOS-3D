/**
 * @file entity-store-init.util.ts
 * @module frontend/src/stores
 * 实体 store 初始化与全量/分批 hydrate（从 entity-store-support.ts 拆回）。
 *
 * 职责：
 * - initStates：全量/分批写入实体（来自 WS initial_states 或 REST 回退）
 * - beginIncrementalInitialStates / mergeInitialStatesChunk / finishIncrementalInitialStates：
 *   渐进式 initial_states 同步（多 chunk 合并 + token 防过期）
 * - applyDeferredCacheHydrate：IDB 缓存余量 idle 补全（懒加载分流 deferred 部分）
 * - shouldAcceptEntitySnapshot：快照接受策略（防缩小快照污染 + 权限收紧强制接受）
 * - finishEntityInit：完成加载后调用性能自适应、派生重建、缓存持久化
 *
 * 关键依赖：
 * - @homeos/shared：sortEntitiesBySyncPriority（按布局优先级排序）
 * - @/utils/config/frontend-config：Worker 派生阈值、poll tick 调整
 * - @/utils/perf/adaptive-perf.util：自适应前端性能模式
 * - @/utils/perf/tablet-default-perf.util：平板默认性能模式
 * - @/utils/entity/derived.util：实体显示名
 * - @/stores/layout.store：平板性能模式应用时读取 layoutConfig
 *
 * 实现说明：
 * - B5：权限（ACL/restrictions）变化后的首个全量快照强制接受并记录指纹，
 *   保证权限收紧时已无权查看的陈旧实体被清除
 * - initStatesBatchToken 自增用于丢弃过期批次响应（并发场景竞态保护）
 */
import { useLayoutStore } from '@/stores/layout.store'
import type {
  EntityInitDeps,
  EntityInitOptions,
  HaEntityState,
  SnapshotAcceptOptions,
} from '@/types/entity-store'
import { getWorkerDerivedThreshold } from '@/utils/config/frontend-config'
import { setPollTickMs } from '@/utils/core/poll-scheduler'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { applyAdaptiveFrontendPerf } from '@/utils/perf/adaptive-perf.util'
import { applyTabletDefaultPerformanceMode } from '@/utils/perf/tablet-default-perf.util'
import { sortEntitiesBySyncPriority } from '@homeos/shared'

// ── entity-store-init.util ──
/**
 * 实体 store 初始化与全量/分批 hydrate（从 entities.store 抽离）
 * @param deps 依赖注入对象（entities / totalCount / loadProgress / 各种回调）
 * @returns initStates / 渐进式同步 API / shouldAcceptEntitySnapshot / countVisibleEntities / markEntityLoadReady
 */
export function createEntityInitHelpers(deps: EntityInitDeps) {
  // 批次 token：自增用于丢弃过期批次响应（initStates 并发 / 增量推送场景竞态保护）
  let initStatesBatchToken = 0
  // 最近一次已接受快照时的权限指纹（role + restrictions），变化时强制接受缩小快照
  let lastAcceptedRestrictionsVersion = ''

  /** 标记加载就绪：进度 100、阶段 'ready' */
  function markEntityLoadReady(): void {
    deps.entityLoadProgress.value = 100
    deps.entityLoadPhase.value = 'ready'
  }

  /**
   * 统计实体列表中可见数量（受当前用户角色与 restrictions 约束）
   * @param entityList 实体列表
   * @returns 可见实体数
   */
  function countVisibleEntities(entityList: HaEntityState[]): number {
    let n = 0
    for (let i = 0; i < entityList.length; i++) {
      if (deps.entityVisible(entityList[i].entity_id!)) n++
    }
    return n
  }

  /**
   * 是否接受本次全量快照（防缩小快照污染）。
   * 策略：
   * - force / fromCache：直接接受
   * - 权限收紧（restrictionsVersion 变化）：强制接受，清除已无权查看的陈旧实体
   * - 内存为空 / incoming >= current：接受
   * - quiet 模式下 incoming < current：静默跳过（轮询刷新场景）
   * - incoming >= current * 0.9：接受（少量波动视为可接受）
   * - 否则拒绝（防服务端部分回退污染前端状态）
   * @param incomingVisible 本次快照可见实体数
   * @param options force / fromCache / quiet / reason
   * @returns 是否接受
   */
  function shouldAcceptEntitySnapshot(
    incomingVisible: number,
    { force = false, fromCache = false, quiet = false, reason = '' }: SnapshotAcceptOptions = {},
  ): boolean {
    if (force || fromCache) return true
    // ACL/restrictions 变化后强制接受快照：权限收紧时 incomingVisible 变小，
    // 若仍按 quiet 拒绝，已无权查看的陈旧实体将残留（quiet 拒绝仅用于权限未变时的轮询静默刷新）
    if (typeof deps.restrictionsVersion === 'function') {
      if (deps.restrictionsVersion() !== lastAcceptedRestrictionsVersion) return true
    }
    const current = deps.totalCount.value
    if (current === 0 || incomingVisible >= current) return true
    if (quiet) {
      deps.logger.debug(`跳过缩小快照 ${incomingVisible} < ${current}(${reason})`)
      return false
    }
    if (incomingVisible >= current * 0.9) return true
    deps.logger.warn(`拒绝缩小快照 ${incomingVisible} << ${current}(${reason})`)
    return false
  }

  /**
   * 追加合并实体列表到内存（不清理已有实体），同步更新 friendlyNamesMap 与 totalCount。
   * @param entityList 待追加的实体列表
   * @returns 本次新增的可见实体数（已存在的实体不计入）
   */
  function mergeEntityListAppend(entityList: HaEntityState[]): number {
    let added = 0
    const len = entityList.length
    for (let i = 0; i < len; i++) {
      const entity = entityList[i]
      if (!deps.entityVisible(entity.entity_id!)) continue
      const had = Boolean(deps.entities[entity.entity_id!])
      deps.entities[entity.entity_id!] = entity
      if (!had) added++
      const name = getEntityDisplayName(entity.entity_id!, entity)
      if (name) deps.friendlyNamesMap[entity.entity_id!] = name
    }
    if (added) deps.totalCount.value += added
    return added
  }

  /**
   * 应用 IDB 缓存的 deferred 部分（懒加载分流）。
   * 通过 initStatesBatchToken 检查防止过期，requestIdleCallback 让帧让步避免阻塞主线程。
   * @param deferredList 待补全的实体列表
   * @param token 启动时的批次 token；过期则中止
   */
  async function applyDeferredCacheHydrate(
    deferredList: HaEntityState[],
    token: number,
  ): Promise<void> {
    if (!deferredList?.length) return
    const sorted = sortEntitiesBySyncPriority(deferredList)
    const batchSize = Math.min(deps.initStatesBatchSize(), 200)
    const total = sorted.length
    const yieldFrame = () =>
      new Promise<void>((resolve) => {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(() => resolve(), { timeout: 2000 })
        } else {
          setTimeout(() => resolve(), 16)
        }
      })

    deps.entityLoadPhase.value = 'hydrating'
    for (let i = 0; i < total; i += batchSize) {
      if (token !== initStatesBatchToken) return
      const end = Math.min(i + batchSize, total)
      mergeEntityListAppend(sorted.slice(i, end))
      deps.entityLoadProgress.value = Math.min(95, 70 + Math.round((end / Math.max(total, 1)) * 25))
      await yieldFrame()
    }
    if (token !== initStatesBatchToken) return
    deps.entityLoadPhase.value = 'rebuilding'
    deps.entityLoadProgress.value = 70
    deps.scheduleRebuildDerived()
    deps.logger.info(`IndexedDB 余量实体 idle 补全 ${total} 个`)
  }

  /**
   * 同步写入实体列表（小数据量路径，无分批）。
   * 清空已有 entities / friendlyNamesMap 后一次性写入。
   * @param entityList 实体列表
   * @returns 可见实体数
   */
  function applyEntityListSync(entityList: HaEntityState[]): number {
    for (const key of Object.keys(deps.entities)) delete deps.entities[key]
    for (const key of Object.keys(deps.friendlyNamesMap)) delete deps.friendlyNamesMap[key]

    let visibleCount = 0
    const len = entityList.length
    for (let i = 0; i < len; i++) {
      const entity = entityList[i]
      if (!deps.entityVisible(entity.entity_id!)) continue
      deps.entities[entity.entity_id!] = entity
      visibleCount++
      const name = getEntityDisplayName(entity.entity_id!, entity)
      if (name) deps.friendlyNamesMap[entity.entity_id!] = name
    }
    deps.totalCount.value = visibleCount
    return visibleCount
  }

  /**
   * 分批写入实体列表（大数据量路径，超过 largeEntityThreshold 时启用）。
   * 清空已有数据后按 batchSize 分批写入，每批之间 yieldFrame 让帧。
   * @param entityList 实体列表
   * @param token 启动时的批次 token；过期则返回 false
   * @returns 是否成功完成（false 表示被并发批次抢占）
   */
  async function applyEntityListBatched(
    entityList: HaEntityState[],
    token: number,
  ): Promise<boolean> {
    for (const key of Object.keys(deps.entities)) delete deps.entities[key]
    for (const key of Object.keys(deps.friendlyNamesMap)) delete deps.friendlyNamesMap[key]

    const visible: HaEntityState[] = []
    for (let i = 0; i < entityList.length; i++) {
      const entity = entityList[i]
      if (deps.entityVisible(entity.entity_id!)) visible.push(entity)
    }
    const total = visible.length
    const batchSize = Math.min(deps.initStatesBatchSize(), 200)
    const yieldFrame = () =>
      new Promise<void>((resolve) => {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(() => resolve(), { timeout: 32 })
        } else {
          requestAnimationFrame(() => resolve())
        }
      })

    for (let i = 0; i < total; i += batchSize) {
      if (token !== initStatesBatchToken) return false
      const end = Math.min(i + batchSize, total)
      for (let j = i; j < end; j++) {
        const entity = visible[j]
        deps.entities[entity.entity_id!] = entity
        const name = getEntityDisplayName(entity.entity_id!, entity)
        if (name) deps.friendlyNamesMap[entity.entity_id!] = name
      }
      deps.entityLoadProgress.value = Math.round((end / Math.max(total, 1)) * 70)
      await yieldFrame()
    }
    deps.totalCount.value = total
    deps.entityLoadPhase.value = 'rebuilding'
    deps.entityLoadProgress.value = 70
    return true
  }

  /**
   * 实体初始化完成后的统一收尾。
   * - loading=false、缓存 hydrate 标志位写入
   * - 调度派生重建、应用自适应性能与平板性能模式
   * - 按总数调整 poll tick（大实体阈值启用 2000ms，否则 1000ms）
   * - 非 fromCache 路径触发一次缓存持久化（写入最新全量到 IDB）
   * @param fromCacheFlag 是否来自缓存 hydrate
   */
  function finishEntityInit(fromCacheFlag: boolean): void {
    deps.loading.value = false
    deps.entitiesCacheHydrated.value = fromCacheFlag
    deps.scheduleRebuildDerived()
    applyAdaptiveFrontendPerf(deps.totalCount.value)
    setPollTickMs(deps.totalCount.value >= getWorkerDerivedThreshold() ? 2000 : 1000)
    try {
      applyTabletDefaultPerformanceMode(useLayoutStore().layoutConfig, deps.totalCount.value)
    } catch {
      /* pinia 未就绪 */
    }
    if (!fromCacheFlag) {
      deps.cancelPersistCacheTimer()
      deps.persistEntityCacheNow().catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        deps.logger.warn(`实体缓存持久化失败: ${msg}`)
      })
    }
  }

  /**
   * 开启渐进式 initial_states 同步：清空内存并返回新的批次 token。
   * @param _expectedTotal 预期总数（占位，未实际使用）
   * @returns 新的批次 token
   */
  function beginIncrementalInitialStates(_expectedTotal = 0): number {
    initStatesBatchToken++
    const token = initStatesBatchToken
    for (const key of Object.keys(deps.entities)) delete deps.entities[key]
    for (const key of Object.keys(deps.friendlyNamesMap)) delete deps.friendlyNamesMap[key]
    deps.totalCount.value = 0
    deps.entityLoadPhase.value = 'hydrating'
    deps.entityLoadProgress.value = 0
    deps.loading.value = true
    deps.entitiesCacheHydrated.value = false
    deps.entitiesStale.value = false
    deps.setConnected(true)
    return token
  }

  /**
   * 合并一个 initial_states chunk 到内存（追加，不清理已有实体）。
   * token 过期则忽略本次 chunk。
   * @param chunk 本次接收的 chunk
   * @param token beginIncrementalInitialStates 返回的 token
   * @param expectedTotal 预期总数（用于进度条）
   */
  function mergeInitialStatesChunk(chunk: HaEntityState[], token: number, expectedTotal = 0): void {
    if (token !== initStatesBatchToken) return
    const sorted = sortEntitiesBySyncPriority(chunk)
    let visibleAdded = 0
    for (let i = 0; i < sorted.length; i++) {
      const entity = sorted[i]
      if (!deps.entityVisible(entity.entity_id!)) continue
      const had = Boolean(deps.entities[entity.entity_id!])
      deps.entities[entity.entity_id!] = entity
      if (!had) visibleAdded++
      const name = getEntityDisplayName(entity.entity_id!, entity)
      if (name) deps.friendlyNamesMap[entity.entity_id!] = name
    }
    deps.totalCount.value += visibleAdded
    if (expectedTotal > 0) {
      deps.entityLoadProgress.value = Math.min(
        65,
        Math.round((deps.totalCount.value / expectedTotal) * 65),
      )
    } else if (visibleAdded) {
      deps.entityLoadProgress.value = Math.min(65, deps.entityLoadProgress.value + 2)
    }
  }

  /**
   * 完成渐进式 initial_states 同步：标记重建阶段、清除 stale、调用 finishEntityInit。
   * @param token 启动时的批次 token；过期则忽略
   * @param expectedTotal 预期总数（仅用于日志输出）
   */
  function finishIncrementalInitialStates(token: number, expectedTotal = 0): void {
    if (token !== initStatesBatchToken) return
    deps.entityLoadPhase.value = 'rebuilding'
    deps.entityLoadProgress.value = 70
    deps.entitiesStale.value = false
    markEntityLoadReady()
    finishEntityInit(false)
    deps.logger.info(
      `已通过 WebSocket 渐进同步 ${deps.totalCount.value}${expectedTotal ? `/${expectedTotal}` : ''} 个实体`,
    )
  }

  /**
   * 主入口：写入一批实体到内存（来自 WS initial_states 或 REST 回退）。
   * 关键路径：
   * 1. force=true 时自增批次 token 抢占已有批次
   * 2. 空列表场景：内存也为空时 clearAllEntities，否则仅标记 ready
   * 3. 经 shouldAcceptEntitySnapshot 决策是否接受（防缩小快照污染 + 权限收紧强制接受）
   * 4. 大数据量走 applyEntityListBatched（分批 + yieldFrame），否则走 applyEntityListSync
   * 5. 完成后 finishInit：标记 ready、finishEntityInit、可选调度 deferred 懒加载补全
   * @param entityList 实体列表
   * @param opts fromCache / force / reason / deferredRemainder
   * @returns 完成的 Promise（供调用方串行队列等待）
   */
  function initStates(entityList: HaEntityState[], opts: EntityInitOptions = {}): Promise<void> {
    const { fromCache = false, force = false, reason = '', deferredRemainder = null } = opts
    if (force && !fromCache) {
      initStatesBatchToken++
    }
    if (!entityList || !entityList.length) {
      if (deps.totalCount.value === 0) deps.clearAllEntities()
      markEntityLoadReady()
      return Promise.resolve()
    }
    const sortedList = fromCache ? entityList : sortEntitiesBySyncPriority(entityList)
    const incomingVisible = countVisibleEntities(sortedList)
    // 权限（ACL/restrictions）变化后的首个全量快照强制接受并记录版本，
    // 保证 fetchEntitiesFallback 预检查与 initStates 二次判断在权限收紧场景下均放行
    const restrictionsChanged =
      typeof deps.restrictionsVersion === 'function' &&
      deps.restrictionsVersion() !== lastAcceptedRestrictionsVersion
    if (
      !shouldAcceptEntitySnapshot(incomingVisible, {
        force: force || restrictionsChanged,
        fromCache,
        reason,
      })
    ) {
      return Promise.resolve()
    }
    if (restrictionsChanged && typeof deps.restrictionsVersion === 'function') {
      lastAcceptedRestrictionsVersion = deps.restrictionsVersion()
    }

    const finishInit = (fromCacheFlag: boolean, scheduleDeferred = true): void => {
      markEntityLoadReady()
      finishEntityInit(fromCacheFlag)
      if (scheduleDeferred && deferredRemainder?.length) {
        initStatesBatchToken++
        const deferToken = initStatesBatchToken
        void applyDeferredCacheHydrate(deferredRemainder, deferToken).then(() => {
          if (deferToken === initStatesBatchToken) markEntityLoadReady()
        })
      }
    }

    const useBatch = !fromCache && sortedList.length > deps.largeEntityThreshold()

    if (!useBatch) {
      applyEntityListSync(sortedList)
      finishInit(fromCache)
      return Promise.resolve()
    }

    initStatesBatchToken++
    const token = initStatesBatchToken
    deps.entityLoadPhase.value = 'hydrating'
    deps.entityLoadProgress.value = 0
    deps.loading.value = true

    // 返回批量应用的 Promise，供调用方（wsBatchApplyTail 串行队列）等待完成
    return (async () => {
      const ok = await applyEntityListBatched(sortedList, token)
      if (!ok || token !== initStatesBatchToken) return
      finishInit(false)
    })()
  }

  return {
    markEntityLoadReady,
    countVisibleEntities,
    shouldAcceptEntitySnapshot,
    initStates,
    beginIncrementalInitialStates,
    mergeInitialStatesChunk,
    finishIncrementalInitialStates,
  }
}
