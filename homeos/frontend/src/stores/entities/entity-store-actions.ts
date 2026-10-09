/**
 * @file frontend\src\stores\entities\entity-store-actions.ts
 * @module src
 */
/**
 * HA 服务调用与预报（从 entities.store 抽离）
 *
 * 职责：
 * - callService：调用 Home Assistant 服务（domain + service + entityId + serviceData）
 *   提供「乐观更新 + 去重窗口 + 权限校验 + HA 离线危险命令拦截 + 失败回滚」
 * - fetchForecasts：调用 weather.get_forecasts 获取天气预报数组，缓存到 forecasts
 *   提供 10 分钟失败冷却，避免 HA 断连时反复刷屏
 * - isEntityCallPending：查询实体是否处于服务调用中（按钮 loading 态）
 * - refreshEntityAfterService：服务调用后 REST 拉取最新实体状态，按 state + 时间戳
 *   判断是否真实变化以避免无意义覆盖；同步维护派生索引与投影
 *
 * 关键依赖：
 * - @/stores/entities/entity-store-optimistic.util：predictOptimistic / applyOptimistic / rollbackOptimistic
 * - @/utils/config/frontend-config：coldEntityOnDemand / callDedupWindowMs
 * - @/utils/ha/url：HA 离线时危险服务调用拦截
 * - @/utils/core/error-message：统一 API 错误消息提取
 *
 * 实现说明：
 * - pendingCalls 用 Map 实现「同一 domain.service.entityId + serviceData」在去重窗口内复用 Promise
 *   （toggle 等取反类服务除外，连点语义是两次独立操作，合并会吞掉第二次）
 * - pendingEntityIds 用 Set + 引用计数处理同一实体并发多服务调用，引用归零才移除
 */
import { reactive } from 'vue'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { predictOptimistic } from '@/stores/entities/entity-store-optimistic.util'
import { getWsPushPublicConfig } from '@/utils/config/frontend-config'
import {
  blockDangerousHaServiceWhenOffline,
  HA_OFFLINE_DANGEROUS_CONTROL_MSG,
} from '@/utils/ha/url'
import { useChromeStore } from '@/stores/chrome.store'
import type { EntityActionsDeps, HaEntityState } from '@/types/entity-store'

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
   * - 乐观更新已生效且 coldEntityOnDemand 关闭时跳过（依赖 WS 推送确认）
   * - 按 state + last_changed/last_updated 判断是否真实变化以避免无意义覆盖
   * - 覆盖缓存时同步维护派生索引与投影（patchDerivedChanges / patchProjectionsFromChanges）
   * - 仅更新缓存，不派发监听器（避免与乐观更新 / WS 回显重复）
   * @param entityId 实体 ID
   * @param didOptimistic 本次调用是否触发了乐观更新
   */
  async function refreshEntityAfterService(
    entityId: string,
    didOptimistic: boolean,
  ): Promise<void> {
    if (typeof entityId !== 'string' || !entityId) return
    const coldOnDemand = getWsPushPublicConfig()?.coldEntityOnDemand
    if (didOptimistic && !coldOnDemand) return
    try {
      const { fetchEntityById } = await import('@/utils/entity/cold-fetch.util')
      const fetched = (await fetchEntityById(entityId, { refresh: true })) as
        HaEntityState | null | undefined
      if (!fetched?.entity_id || fetched.entity_id !== entityId) return
      const prev = deps.entities[entityId] ?? null
      // 原 prev?.attributes === fetched.attributes 是对象引用比较恒 false → 每次都覆盖；
      // 改为按 state + last_changed/last_updated 判断是否真实变化，未变化则跳过覆盖
      if (prev) {
        const prevStamp = prev.last_updated ?? prev.last_changed
        const nextStamp = fetched.last_updated ?? fetched.last_changed
        if (prev.state === fetched.state && prevStamp && nextStamp && prevStamp === nextStamp) {
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
    } catch {
      /* REST 回退失败时依赖 WS / 乐观态 */
    }
  }

  /**
   * 调用 HA 服务（POST /services/call）。
   * 关键流程：
   * 1. HA 离线危险命令拦截（blockDangerousHaServiceWhenOffline）
   * 2. 权限校验（canControl），非控制模式（returnResponse=true）跳过
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
    if (typeof entityId === 'string' && entityId && !returnResponse && !deps.canControl(entityId)) {
      throw new Error('当前账户无权操作该设备')
    }
    const dedupKey = `${domain}.${service}.${entityId}.${JSON.stringify(serviceData || {})}`
    const existing = shouldDedupeServiceCall(service) ? pendingCalls.get(dedupKey) : undefined
    if (existing && Date.now() - existing.time < deps.callDedupWindowMs()) {
      return existing.promise
    }

    if (typeof entityId === 'string' && entityId) {
      addPendingEntity(entityId)
    }

    let didOptimistic = false
    if (typeof entityId === 'string' && entityId && !returnResponse) {
      const predicted = predictOptimistic(
        domain,
        service,
        entityId,
        serviceData,
        deps.entities[entityId],
      )
      if (predicted) {
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
          service_data: serviceData || {},
          return_response: returnResponse || false,
        })
        const payload = res.data as {
          skipped?: boolean
          queued?: boolean
          data?: { skipped?: boolean }
        } | null
        const skipped = !!(payload?.skipped || payload?.data?.skipped)
        if (skipped && didOptimistic) deps.rollbackOptimistic(entityId)
        if (!quiet && payload) {
          if (skipped) {
            useChromeStore().notify('重复命令已跳过', 'info')
          } else if (payload.queued) {
            useChromeStore().notify('命令已通过重连队列送达', 'info')
          }
        }
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
          if (didOptimistic) useChromeStore().notify('未生效，已恢复', 'warning')
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
    fetchForecasts,
    isEntityCallPending,
    pendingEntityIds,
  }
}
