/**
 * @file frontend\src\stores\entities\entity-store-actions.ts
 * @module src
 */
/**
 * HA 服务调用与预报（从 entities.store 抽离）
 * - callService：调用 Home Assistant 服务（domain + service + entityId + serviceData）
 * 提供「乐观更新 + 去重窗口 + 权限校验 + HA 离线危险命令拦截 + 失败回滚」
 * - fetchForecasts：调用 weather.get_forecasts 获取天气预报数组，缓存到 forecasts
 * 提供 10 分钟失败冷却，避免 HA 断连时反复刷屏
 * - isEntityCallPending：查询实体是否处于服务调用中（按钮 loading 态）
 * - refreshEntityAfterService：服务调用后 REST 拉取最新实体状态，按 state + 时间戳
 * 判断是否真实变化以避免无意义覆盖；同步维护派生索引与投影
 * - 乐观确认：预测与现值相同（如对已关的灯再下 turn_off）时**不建立**乐观态，避免
 * 等一个永远不会来的 `state_changed`；REST 真值与后端 verified=true 同样是确认来源
 */
import { reactive } from 'vue'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { randomUUID } from '@/shared/utils/core/random-uuid.util'
import { predictOptimistic } from '@/stores/entities/entity-store-optimistic.util'
import { optimisticExpectationSatisfied } from '@/stores/entities/optimistic-expectation.util'
import { getWsPushPublicConfig } from '@/shared/utils/config/frontend-config'
import { blockDangerousHaServiceWhenOffline, HA_OFFLINE_DANGEROUS_CONTROL_MSG } from '@/shared/utils/ha/url'
import { useChromeStore } from '@/stores/chrome.store'
import { fetchEntityById } from '@/shared/entity/utils/cold-fetch.util'
import type { EntityActionsDeps, HaEntityState } from '@/shared/types/entity-store'
import {
  describeControlOutcome,
  resolveControlNotice,
  type ControlOutcome,
  type ControlPayload,
} from '@/stores/entities/control-outcome.util'

/** 按控制结果给用户一条提示（没有可说的就不提示）。 */
function notifyControlOutcome(payload: ControlPayload, outcome: ControlOutcome): void {
  const notice = resolveControlNotice(payload, outcome)
  if (notice) useChromeStore().notify(notice.message, notice.level)
}

/** 去重 pending 调用条目：同一 dedupKey 复用此 Promise */
interface PendingCall {
  promise: Promise<unknown>
  time: number
}

/**
 * 状态取反类服务不可去重。
 *
 * 去重窗口内两次同键调用会被合并成一次请求，对幂等命令（turn_on / set_temperature）无副作用，
 * 但 toggle 这类「取反」命令连点两次的语义是「开→关」，合并后会吞掉第二次操作，
 * 用户连点开关只生效一次，且第二次的乐观预测也被跳过。
 */
function isToggleLikeService(service: string): boolean {
  return service === 'toggle' || service === 'media_play_pause' || service.endsWith('_toggle')
}

/** 该服务调用是否允许在去重窗口内复用 pending Promise */
function shouldDedupeServiceCall(service: string): boolean {
  return !isToggleLikeService(service)
}

/**
 * 创建 HA 服务调用与预报动作集合
 * @param deps 依赖注入对象（apiClient / entities / forecasts / logger / applyOptimistic 等）
 * @returns callService / fetchForecasts / isEntityCallPending / pendingEntityIds
 */
export function createEntityActions(deps: EntityActionsDeps) {
  // 去重 pending 调用表：dedupKey（domain.service.entityId + serviceData）→ PendingCall
  const pendingCalls = new Map<string, PendingCall>()
  // pending 实体集合（响应式，供 UI 查询按钮 loading 态）
  const pendingEntityIds = reactive(new Set<string>())
  // pending 实体引用计数：同一实体并发多服务时归零才从 pendingEntityIds 移除
  const pendingEntityRefCount = new Map<string, number>()
  // 预报失败冷却表：entityId:type → 失败截止时间戳
  const forecastFailUntil = new Map<string, number>()
  // 预报失败冷却时长：10 分钟（多为 HA 断连或响应慢，避免反复刷屏）
  const FORECAST_FAIL_COOLDOWN_MS = 10 * 60 * 1000

  /** 增加实体 pending 引用计数并加入 pendingEntityIds */
  function addPendingEntity(entityId: string) {
    pendingEntityRefCount.set(entityId, (pendingEntityRefCount.get(entityId) || 0) + 1)
    pendingEntityIds.add(entityId)
  }

  /**
   * 结清乐观态：清 TTL 定时器 + 摘掉 `_optimistic` 标记（保留当前展示值）。
   *
   * 为什么要显式结清而不是靠「覆盖实体时顺手丢掉 _optimistic」：覆盖只在
   * 「state / 时间戳真的变了」时发生，而「目标态本来就已经满足」恰好是**不变**的那条
   * 分支 —— 旧实现在那里直接 return，乐观标记与 TTL 定时器全都留着，到期必弹误报。
   *
   * @param entityId 实体 ID
   */
  function settleOptimistic(entityId: string): void {
    if (!deps.optimisticState?.has(entityId)) return
    deps.clearOptimistic?.(entityId)
    const current = deps.entities[entityId]
    if (current?._optimistic) {
      const settled: HaEntityState = { ...current }
      delete settled._optimistic
      deps.entities[entityId] = settled
    }
  }

  /**
   * REST 确认：拿到的服务端真值与乐观预测一致时，结清乐观态（REST 与 WS 推送一样是
   * 确认来源）。
   *
   * @param entityId 实体 ID
   * @param fetched REST 拿到的服务端状态
   */
  function confirmOptimisticFromRest(entityId: string, fetched: HaEntityState): void {
    const entry = deps.optimisticState?.get(entityId)
    if (!entry) return
    // 预测未达成（例如服务端明确回报了别的状态）时不结清，交给 TTL 回滚 / 后续推送
    if (!optimisticExpectationSatisfied(entry.expected, fetched)) return
    settleOptimistic(entityId)
  }

  /** 减少实体 pending 引用计数，归零时从 pendingEntityIds 移除 */
  function removePendingEntity(entityId: string) {
    const next = (pendingEntityRefCount.get(entityId) || 1) - 1
    if (next <= 0) {
      pendingEntityRefCount.delete(entityId)
      pendingEntityIds.delete(entityId)
    } else {
      pendingEntityRefCount.set(entityId, next)
    }
  }

  /**
   * 服务调用后从 REST 拉取最新实体状态。
   * - 乐观态仍挂着时必须确认（F10）：旧逻辑在「非 coldOnDemand」时整段跳过 REST，
   *   一旦 `ha_queue_dropped` 丢掉 WS 回显，TTL 到期会把 UI「假恢复」成点控前状态。
   * - 乐观态已结清（verified / WS）则不必再打；coldOnDemand 路径始终拉取。
   * - 按 state + last_changed/last_updated 判断是否真实变化以避免无意义覆盖
   * - 覆盖缓存时同步维护派生索引与投影（patchDerivedChanges / patchProjectionsFromChanges）
   * - 仅更新缓存，不派发监听器（避免与乐观更新 / WS 回显重复）
   * @param entityId 实体 ID
   * @param didOptimistic 本次调用是否触发了乐观更新
   */
  async function refreshEntityAfterService(entityId: string, didOptimistic: boolean): Promise<void> {
    if (typeof entityId !== 'string' || !entityId) return
    const coldOnDemand = getWsPushPublicConfig()?.coldEntityOnDemand
    const stillOptimistic = !!deps.optimisticState?.has(entityId)
    // 已结清且非 cold-on-demand：WS/verified 已确认，跳过多余 GET。
    if (didOptimistic && !coldOnDemand && !stillOptimistic) return
    try {
      const fetched = (await fetchEntityById(entityId, { refresh: true })) as HaEntityState | null | undefined
      if (!fetched?.entity_id || fetched.entity_id !== entityId) return
      // REST 拿到的就是服务端真值，它同样构成「确认」——不止 WS 推送算。
      confirmOptimisticFromRest(entityId, fetched)
      const prev = deps.entities[entityId] ?? null
      // 原 prev?.attributes === fetched.attributes 是对象引用比较恒 false → 每次都覆盖；
      // 改为按 state + last_changed/last_updated 判断是否真实变化，未变化则跳过覆盖
      if (prev) {
        const prevStamp = prev.last_updated ?? prev.last_changed
        const nextStamp = fetched.last_updated ?? fetched.last_changed
        if (prev.state === fetched.state && prevStamp && nextStamp && prevStamp === nextStamp) {
          // 「没有变化」正是「目标态已满足」的样子（例如对已经关掉的灯再下发 turn_off：
          // HA 不发 state_changed，REST 也返回同一份状态）。旧实现在这里直接 return，
          // 把这次确认信号整个丢掉，_optimistic 留在缓存上，TTL 到期必然误报一次。
          return
        }
      }
      deps.entities[entityId] = fetched
      // 覆盖缓存时同步维护派生索引与投影（参考 applyOptimistic 的调用方式），
      // 避免绕过 patchDerivedChanges 导致 domainCounts / cachedDomains 等派生索引陈旧
      deps.patchDerivedChanges?.([{ entity_id: entityId, oldEntity: prev, newEntity: fetched }])
      deps.patchProjectionsFromChanges?.([{ entity_id: entityId }])
      // 传入实体 ID：粒度化递增该实体/域的版本号
      deps.bumpEntityStateRevision?.(entityId)
      // 状态同步仅更新缓存，不派发监听器（避免与乐观更新 / WS 回显重复）
    } catch (error) {
      /* REST 回退失败时依赖 WS / 乐观态 */
      // 但必须留下痕迹：这条路径失败时界面上不会有任何反馈（乐观态随后由 TTL 静默回滚），
      // 排查「点了没反应 / 状态自己跳回去」只能靠这行日志。
      deps.logger.debug(`服务后 REST 刷新状态失败 ${entityId}:`, error)
    }
  }

  /**
   * 调用 HA 服务（POST /services/call）。
   * 关键流程：
   * 1. HA 离线危险命令拦截（blockDangerousHaServiceWhenOffline）
   * 2. 权限校验（isEntityAllowed），非控制模式（returnResponse=true）跳过
   * 3. 去重窗口内复用同一 Promise（同 dedupKey）
   * 4. 乐观更新（predictOptimistic + applyOptimistic）
   * 5. 调用 API，按响应（skipped / queued）回滚或 toast
   * 6. 非跳过场景延迟 350~600ms 后 REST 拉取最新状态
   * 7. 异常时回滚乐观态 + toast 警告（非 quiet 路径）
   * @param domain HA 域（light / climate / cover 等）
   * @param service HA service 名（turn_on / turn_off / set_temperature 等）
   * @param entityId 实体完整 ID
   * @param serviceData service 参数对象
   * @param returnResponse 是否要求返回响应（true 时跳过权限校验与乐观更新）
   * @param options.quiet 是否静默（不弹 toast）
   * @returns 后端响应数据
   */
  async function callService(
    domain: string,
    service: string,
    entityId: string,
    serviceData: Record<string, unknown> | null | undefined,
    returnResponse: boolean,
    options: { quiet?: boolean } = {},
  ): Promise<unknown> {
    const { quiet = false } = options
    if (blockDangerousHaServiceWhenOffline(deps.isHaConnected(), domain, service, entityId)) {
      throw new Error(HA_OFFLINE_DANGEROUS_CONTROL_MSG)
    }
    if (typeof entityId === 'string' && entityId && !returnResponse && !deps.isEntityAllowed(entityId)) {
      throw new Error('当前账户无权操作该设备')
    }
    const dedupKey = `${domain}.${service}.${entityId}.${JSON.stringify(serviceData || {})}`
    // 幂等键按「一次手势」生成一次：去重窗口外的同一次重试必须复用同一个键，
    // 否则服务端会把它当成新命令再执行一遍。
    const idempotencyKey = randomUUID()
    const existing = shouldDedupeServiceCall(service) ? pendingCalls.get(dedupKey) : undefined
    if (existing && Date.now() - existing.time < deps.callDedupWindowMs()) {
      return existing.promise
    }

    if (typeof entityId === 'string' && entityId) {
      addPendingEntity(entityId)
    }

    let didOptimistic = false
    if (typeof entityId === 'string' && entityId && !returnResponse) {
      const predicted = predictOptimistic(domain, service, entityId, serviceData, deps.entities[entityId])
      // 预测与现值相同 = 这一次调用**没有可等的东西**（典型：批量「全部关闭」里那些
      // 本来就关着的灯）。HA 不会为「状态没变」推 state_changed，若照样建立乐观态，
      // TTL 到期必然误报一次「未收到确认」。这里直接跳过乐观写入。
      if (predicted && !optimisticExpectationSatisfied(predicted, deps.entities[entityId])) {
        deps.applyOptimistic(entityId, predicted)
        didOptimistic = true
      }
    }

    const callPromise = (async () => {
      try {
        const res = await deps.apiClient.post('/services/call', {
          domain,
          service,
          entity_id: entityId,
          // 参数键统一用 ``data``：``/ha/services/call`` 与 ``/services/call`` 的 DTO 都收
          // （后者会把 data 归一成 service_data；只发旧键 service_data 的老 bundle 仍兼容）。
          // 曾因键名不匹配被 StrictModel 判 400「data: Extra inputs are not permitted」。
          data: serviceData || {},
          return_response: returnResponse || false,
          // 同一手势的幂等键：网络层重发同一请求时服务端只执行一次；
          // 用户再按一次是新的手势（新键），不会被误吞。
          // 键在重试链路上复用（同一 promise / 同一次手势重发），服务端据此复用真实结果。
          idempotency_key: idempotencyKey,
        })
        const payload = res.data as ControlPayload | null
        const outcome = describeControlOutcome(payload)
        if (didOptimistic && outcome.shouldRollback) deps.rollbackOptimistic(entityId)
        // 响应已返回、且后端确认（verified !== false）：确认窗口从这一刻起算，
        // 而不是从点击时刻 —— 云端设备的往返本来就吃掉了预算。
        if (didOptimistic && !outcome.shouldRollback) deps.touchOptimistic?.(entityId)
        // 后端后置校验已明确看到目标态（verified=true）时无需再等 WS 推送：
        // 再等一轮只会把「确认」拖成一次假的超时告警。
        if (didOptimistic && payload?.verified === true) settleOptimistic(entityId)
        if (!quiet && payload) notifyControlOutcome(payload, outcome)
        const skipped = outcome.skipped
        if (typeof entityId === 'string' && entityId && !returnResponse && !skipped) {
          setTimeout(
            () => {
              void refreshEntityAfterService(entityId, didOptimistic)
            },
            didOptimistic ? 600 : 350,
          )
        }
        return res.data
      } catch (e: unknown) {
        if (didOptimistic) deps.rollbackOptimistic(entityId)
        pendingCalls.delete(dedupKey)
        if (!quiet) {
          // 与「超时未确认」严格区分：这里命令**没有下发成功**，设备根本没收到指令。
          if (didOptimistic) useChromeStore().notify('指令下发失败，已恢复', 'error')
          const err = e as { response?: { data?: unknown } }
          deps.logger.error('服务调用失败', err.response?.data || e)
        }
        throw e
      } finally {
        if (typeof entityId === 'string' && entityId) {
          removePendingEntity(entityId)
        }
        setTimeout(() => pendingCalls.delete(dedupKey), deps.callDedupWindowMs())
      }
    })()

    pendingCalls.set(dedupKey, { promise: callPromise, time: Date.now() })
    return callPromise
  }

  /**
   * 批量预检：把条目分成「可以下发」与「客户端已拦截」两组。
   *
   * 离线高风险拦截与权限校验仍在客户端先做一遍：整批提交后由服务端拒绝会更慢，
   * 而且失败原因混在批量结果里不易定位。
   */
  function splitBatchByPreflight(items: BatchControlItem[]) {
    const usable: Array<BatchControlItem & { index: number }> = []
    const preflight: Array<{ index: number; entityId: string; error: string }> = []
    items.forEach((item, index) => {
      const blocked = preflightBlockReason(item)
      if (blocked) {
        preflight.push({ index, entityId: item.entityId, error: blocked })
        return
      }
      usable.push({ ...item, index })
    })
    return { usable, preflight }
  }

  /** 该条目在客户端就被拦截的原因；可下发返回 ``null``。 */
  function preflightBlockReason(item: BatchControlItem): string | null {
    if (blockDangerousHaServiceWhenOffline(deps.isHaConnected(), item.domain, item.service, item.entityId)) {
      return HA_OFFLINE_DANGEROUS_CONTROL_MSG
    }
    return deps.isEntityAllowed(item.entityId) ? null : '当前账户无权操作该设备'
  }

  /** 批量控制条目的入参（与单条 callService 的参数一一对应）。 */
  interface BatchControlItem {
    domain: string
    service: string
    entityId: string
    serviceData?: Record<string, unknown> | null
  }

  interface BatchControlSummary {
    total: number
    ok: number
    failed: number
    results: Array<{ index: number; entityId?: string; ok: boolean; error?: string }>
  }

  /**
   * 批量下发（POST /services/batch）。
   *
   * 与「逐个 callService + Promise.allSettled」的区别：
   * - 服务端限并发（默认 4），不会一次打出门店数量的并发请求；
   * - 逐项结果可枚举，部分失败不会让界面只看到一个笼统的「失败」；
   * - 每个实体只发一条命令，避免连点在同一实体上堆叠。
   *
   * 乐观更新与回滚按条目独立处理：批量关灯时本来就有大量「已经是关」的设备，
   * 它们不会建立乐观态，也不会因为「没收到确认」被回滚。
   *
   * @param items 条目列表
   * @param options.quiet 是否静默（不弹汇总 toast）
   * @param options.concurrency 服务端并发上限（1–16）
   * @param options.cancelOnError 第一条失败后是否停止后续下发
   * @returns 汇总（total / ok / failed / results）
   */
  async function callServiceBatch(
    items: BatchControlItem[],
    options: { quiet?: boolean; concurrency?: number; cancelOnError?: boolean } = {},
  ): Promise<BatchControlSummary> {
    const { quiet = false } = options
    const { usable, preflight } = splitBatchByPreflight(items)

    if (!usable.length) {
      if (!quiet && preflight.length) useChromeStore().notify('批量操作全部被拦截', 'warning')
      return {
        total: items.length,
        ok: 0,
        failed: preflight.length,
        results: preflight.map((item) => ({ ...item, ok: false })),
      }
    }

    const optimistic = applyBatchOptimistic(usable)

    try {
      const res = await deps.apiClient.post('/services/batch', {
        items: usable.map((item) => ({
          domain: item.domain,
          service: item.service,
          entity_id: item.entityId,
          data: item.serviceData || {},
        })),
        concurrency: options.concurrency,
        cancelOnError: options.cancelOnError,
      })
      const payload = res.data as { results?: BatchControlSummary['results'] } | null
      const results = mapBatchResults(payload?.results, usable)
      settleBatchOptimistic(results, usable, optimistic)
      return summarizeBatch(items.length, results, preflight, quiet)
    } catch (e: unknown) {
      rollbackBatchOptimistic(usable, optimistic)
      if (!quiet) useChromeStore().notify('批量操作失败，已全部恢复', 'error')
      deps.logger.error('批量服务调用失败', e)
      throw e
    } finally {
      for (const item of usable) removePendingEntity(item.entityId)
    }
  }

  /** 批量成功路径的汇总与提示（失败项数 = 服务端失败 + 客户端预检拦截）。 */
  function summarizeBatch(
    total: number,
    results: BatchControlSummary['results'],
    preflight: Array<{ index: number; entityId: string; error: string }>,
    quiet: boolean,
  ): BatchControlSummary {
    const failed = results.filter((row) => !row.ok).length + preflight.length
    const merged = [...results, ...preflight.map((item) => ({ ...item, ok: false }))].sort((a, b) => a.index - b.index)
    if (!quiet && failed > 0) {
      useChromeStore().notify(`批量操作完成：${total - failed} 成功 / ${failed} 失败`, 'warning')
    }
    return { total, ok: total - failed, failed, results: merged }
  }

  /** 整批失败时回滚所有「建立过乐观态」的条目。 */
  function rollbackBatchOptimistic(
    usable: Array<BatchControlItem & { index: number }>,
    optimistic: Map<number, boolean>,
  ): void {
    for (const item of usable) {
      if (optimistic.get(item.index) === true) deps.rollbackOptimistic(item.entityId)
    }
  }

  /** 逐条建立乐观态（与单条 callService 同一套预测），返回「建立过乐观态」的下标集合。 */
  function applyBatchOptimistic(usable: Array<BatchControlItem & { index: number }>) {
    const optimistic = new Map<number, boolean>()
    for (const item of usable) {
      const predicted = predictOptimistic(
        item.domain,
        item.service,
        item.entityId,
        item.serviceData,
        deps.entities[item.entityId],
      )
      if (predicted && !optimisticExpectationSatisfied(predicted, deps.entities[item.entityId])) {
        deps.applyOptimistic(item.entityId, predicted)
        optimistic.set(item.index, true)
      }
      addPendingEntity(item.entityId)
    }
    return optimistic
  }

  /**
   * 服务端结果 → 调用方下标。
   *
   * 服务端返回的 ``index`` 是**本批提交**里的下标（预检拦截的条目不在其中），
   * 必须映射回调用方的原始下标，否则前端的失败项会指错设备。
   */
  function mapBatchResults(
    rows: BatchControlSummary['results'] | undefined,
    usable: Array<BatchControlItem & { index: number }>,
  ): BatchControlSummary['results'] {
    return (rows || []).map((row) => ({
      ...row,
      index: usable[row.index]?.index ?? row.index,
      entityId: row.entityId ?? usable[row.index]?.entityId,
    }))
  }

  /** 按逐项结果结算乐观态：失败回滚、成功续期确认窗口。 */
  function settleBatchOptimistic(
    results: BatchControlSummary['results'],
    usable: Array<BatchControlItem & { index: number }>,
    optimistic: Map<number, boolean>,
  ): void {
    const byIndex = new Map(results.map((row) => [row.index, row]))
    for (const item of usable) {
      const row = byIndex.get(item.index)
      const didOptimistic = optimistic.get(item.index) === true
      if (!row || row.ok === false) {
        if (didOptimistic) deps.rollbackOptimistic(item.entityId)
        continue
      }
      if (didOptimistic) deps.touchOptimistic?.(item.entityId)
    }
  }

  /**
   * 从原始响应中解析天气预报道组。
   * 兼容三种结构：response[entityId].forecast / service_response[entityId].forecast / 直接数组
   * @param entityId 天气实体 ID
   * @param raw 原始响应数据
   * @returns 预报数组；无数据时返回空数组
   */
  function parseForecastPayload(entityId: string, raw: unknown): unknown[] {
    if (!raw) return []
    const responseData =
      (raw as { response?: Record<string, unknown> }).response ||
      (raw as { service_response?: Record<string, unknown> }).service_response ||
      raw
    const entityData = (responseData as Record<string, unknown>)[entityId] || responseData
    if (entityData && Array.isArray((entityData as { forecast?: unknown[] }).forecast)) {
      return (entityData as { forecast: unknown[] }).forecast
    }
    if (Array.isArray(entityData)) return entityData
    if (Array.isArray(raw)) return raw
    return []
  }

  /**
   * 获取天气预报数组（调用 weather.get_forecasts）。
   * - 冷却期内（10 分钟）直接跳过，避免 HA 断连时反复刷屏
   * - 若实体 attributes.forecast 已有数据则直接复用，跳过服务调用
   * - 超时与普通失败分别记录不同日志级别
   * @param entityId 天气实体 ID
   * @param type 预报类型，默认 'daily'
   */
  async function fetchForecasts(entityId: string, type = 'daily'): Promise<void> {
    if (!entityId || !deps.isAuthenticated()) return

    const failUntil = forecastFailUntil.get(`${entityId}:${type}`)
    if (failUntil && Date.now() < failUntil) return

    if (!deps.forecasts[entityId]?.length) {
      const attrForecast = deps.entities[entityId]?.attributes?.forecast
      if (Array.isArray(attrForecast) && attrForecast.length > 0) {
        deps.forecasts[entityId] = attrForecast as unknown[]
        return
      }
    }

    try {
      const result = (await callService('weather', 'get_forecasts', entityId, { type }, true, {
        quiet: true,
      })) as { data?: unknown } | undefined
      const forecastArray = parseForecastPayload(entityId, result?.data)
      if (forecastArray.length > 0) {
        deps.forecasts[entityId] = forecastArray
        forecastFailUntil.delete(`${entityId}:${type}`)
      }
    } catch (e: unknown) {
      forecastFailUntil.set(`${entityId}:${type}`, Date.now() + FORECAST_FAIL_COOLDOWN_MS)
      const ax = e as { code?: string; message?: string; response?: { data?: unknown } }
      const msg = getApiErrorMessage(e, '')
      // Axios 原文含 timeout；getApiErrorMessage 会译成「请求超时」——两者都算超时
      const timedOut =
        ax.code === 'ECONNABORTED' ||
        /timeout|超时/i.test(String(ax.message || '')) ||
        /timeout|超时/i.test(String(msg))
      if (timedOut) {
        deps.logger.warn(`天气预报超时(${entityId}),10 分钟内不再重试(多为 HA 断连或响应慢)`)
      } else {
        deps.logger.warn(`获取 ${entityId} 预报失败:${msg || '未知错误'}`, ax.response?.data)
      }
    }
  }

  /** 实体是否处于服务调用中（按钮 loading 态查询） */
  function isEntityCallPending(entityId: string): boolean {
    return !!entityId && pendingEntityIds.has(entityId)
  }

  return {
    callService,
    callServiceBatch,
    fetchForecasts,
    isEntityCallPending,
    pendingEntityIds,
  }
}
