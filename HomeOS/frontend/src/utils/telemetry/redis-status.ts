/**
 * Redis 健康状态工具模块。
 *
 * 职责：
 * - 判定 Redis 状态字符串是否为就绪/不可用；
 * - 将 WS 实时状态与 /health API 快照归一化为 RedisHealthView；
 * - 提供状态标签与 Tailwind 文字色类，供设置页统计格复用；
 * - 合并 WS 实时状态与 diagnostics API 快照，WS 优先。
 *
 * 依赖：RedisHealthFromApi、RedisHealthSnapshot、RedisHealthView、WsRedisStatus 类型。
 */
import type {
  RedisHealthFromApi,
  RedisHealthSnapshot,
  RedisHealthView,
  WsRedisStatus,
} from '@/types/redis-status'

/**
 * 判定状态字符串是否表示 Redis 就绪。
 *
 * 与后端 ws-push-redis-status.util / GET /health 对齐。
 *
 * @param status 状态字符串
 * @returns true 表示 connected 或 ready
 */
export function isRedisReadyStatus(status: string | null | undefined): boolean {
  return status === 'connected' || status === 'ready'
}

/**
 * 判定状态字符串是否表示 Redis 不可用。
 *
 * @param status 状态字符串
 * @returns true 表示 offline/unavailable/error
 */
export function isRedisUnavailableStatus(status: string | null | undefined): boolean {
  return status === 'offline' || status === 'unavailable' || status === 'error'
}

/**
 * 将 /health 接口的 redis_ok 布尔值解析为 RedisHealthFromApi。
 *
 * @param redisOk 布尔值（null/undefined 表示未配置）
 * @returns 归一化后的健康状态对象
 */
function parseRedisFromHealth(redisOk: boolean | null | undefined): RedisHealthFromApi {
  if (redisOk === null || redisOk === undefined) {
    return { configured: false, ok: false, status: 'unavailable' }
  }
  return {
    configured: true,
    ok: redisOk === true,
    status: redisOk === true ? 'connected' : 'offline',
  }
}

/**
 * 将 WS Redis 状态转换为视图层 RedisHealthView。
 *
 * 状态映射：
 * - unknown → 加载中
 * - unavailable → 未配置
 * - offline/error → 已配置但不健康
 * - connected/ready → 已配置且健康
 *
 * @param wsStatus WS 推送的 Redis 状态
 * @returns 视图层健康状态对象
 */
export function redisHealthViewFromStatus(wsStatus: WsRedisStatus): RedisHealthView {
  if (wsStatus === 'unknown') {
    return { loading: true, configured: false, ok: false }
  }
  if (wsStatus === 'unavailable') {
    return { loading: false, configured: false, ok: false }
  }
  if (wsStatus === 'offline' || wsStatus === 'error') {
    return { loading: false, configured: true, ok: false }
  }
  if (isRedisReadyStatus(wsStatus)) {
    return { loading: false, configured: true, ok: true }
  }
  return { loading: false, configured: false, ok: false }
}

/**
 * 将 RedisHealthView 转换为中文状态标签。
 *
 * @param view 视图层健康状态
 * @returns 中文标签：检测中…/未配置/就绪/未连接
 */
export function redisStatusToLabel(view: RedisHealthView): string {
  if (view.loading) return '检测中…'
  if (!view.configured) return '未配置'
  return view.ok ? '就绪' : '未连接'
}

/**
 * 根据 Redis 健康状态返回 Tailwind 文字色类。
 *
 * @param view 视图层健康状态
 * @returns Tailwind 类名：text-gray-400（加载/未配置）/text-green-400（就绪）/text-amber-400（未连接）
 */
/** Tailwind 文字色，供设置页统计格复用 */
export function redisStatusClass(view: RedisHealthView): string {
  if (view.loading || !view.configured) return 'text-gray-400'
  return view.ok ? 'text-green-400' : 'text-amber-400'
}

/**
 * 合并 WS 实时状态与 diagnostics API 快照。
 *
 * WS 状态非 unknown 时以 WS 为准（实时性更高）；
 * WS 为 unknown 时回退到 API 快照。
 *
 * @param wsStatus WS 推送的 Redis 状态
 * @param apiRedis diagnostics API 快照
 * @returns 合并后的视图层健康状态
 */
/** 合并 WS 实时状态与 diagnostics API 快照 */
export function mergeRedisHealthView(
  wsStatus: WsRedisStatus,
  apiRedis: RedisHealthSnapshot | null | undefined,
): RedisHealthView {
  const live = redisHealthViewFromStatus(wsStatus)
  if (wsStatus !== 'unknown') return live
  if (!apiRedis) return live
  return {
    loading: false,
    configured: Boolean(apiRedis.configured),
    ok: apiRedis.ok === true,
  }
}

/**
 * 从 /health 接口拉取 Redis 健康状态。
 *
 * @returns RedisHealthFromApi；HTTP 非 2xx 抛出「健康检查失败（状态码）」
 */
export async function fetchRedisStatusFromHealth(): Promise<RedisHealthFromApi> {
  const res = await fetch('/health')
  if (!res.ok) throw new Error(`健康检查失败（${res.status}）`)
  const data = (await res.json()) as { redis_ok?: boolean | null }
  return parseRedisFromHealth(data?.redis_ok)
}