/**
 * @file 环境 IAQ（室内空气质量）请求 Composable
 * @module composables/climate/useEnvIaq
 * @description
 *   提供 带 dedupe 缓存的环境 IAQ 计算请求，由 EnvironmentHealth 与 ComfortScore 共用。
 *   通过 sharedFetch 实现相同输入的请求去重与 TTL 缓存，避免短时间重复调用后端。
 *   依赖：@/services/api/system 的 calculateEnvIaq、@/utils/core/poll-scheduler 的 sharedFetch、
 *   @/utils/climate/env-score.util 的传感器数据收集与结果类型。
 */
import { calculateEnvIaq } from '@/services/api/system'
import { sharedFetch } from '@/utils/core/poll-scheduler'
import { getApiErrorMessage } from '@/utils/core/error-message'
import {
  collectEnvSensorData,
  type EnvIaqResult,
  type EnvSensorMapLike,
} from '@/utils/climate/env-score.util'

/** ENV_IAQ_CACHE_PREFIX：常量，取值语义见定义处。 */
export const ENV_IAQ_CACHE_PREFIX = 'rest:POST:/environment/iaq:'

function sensorMapCacheToken(sensorMap?: EnvSensorMapLike | null): string {
  if (!sensorMap) return ''
  try {
    return JSON.stringify(sensorMap)
  } catch {
    return 'unserializable'
  }
}

/**
 * 环境 IAQ 请求结果（联合类型）
 * - ok: 成功，携带 EnvIaqResult 数据
 * - no_sensors: 未找到环境传感器
 * - error: 请求失败，携带错误消息
 */
type FetchEnvIaqOutcome =
  | { status: 'ok'; data: EnvIaqResult }
  | { status: 'no_sensors' }
  | { status: 'error'; message: string }

/**
 * 带 dedupe 缓存的环境 IAQ 请求（与 EnvironmentHealth / ComfortScore 共用）
 * @param entities 实体字典（key 为 entity_id，value 含 state/attributes）
 * @param cacheTtlMs 缓存有效期（毫秒），默认 60 秒
 * @param sensorMap 可选的传感器映射配置（指定哪些实体作为温湿度/CO2 等）
 * @returns FetchEnvIaqOutcome 联合结果
 */
export async function fetchEnvIaq(
  entities: Record<string, { state?: string; attributes?: Record<string, unknown> } | undefined>,
  cacheTtlMs = 60_000,
  sensorMap?: EnvSensorMapLike | null,
): Promise<FetchEnvIaqOutcome> {
  // 先从实体字典中收集环境传感器数据，无数据则直接返回 no_sensors
  const input = collectEnvSensorData(entities, sensorMap)
  if (!input) return { status: 'no_sensors' }
  // 缓存 key 基于输入数据与是否使用 sensorMap 生成，确保相同输入命中缓存
  const iaqKey = `${ENV_IAQ_CACHE_PREFIX}${JSON.stringify({ input, map: sensorMapCacheToken(sensorMap) })}`
  try {
    const data = await sharedFetch(
      iaqKey,
      async () => {
        const { data: res } = await calculateEnvIaq({ ...input })
        const body = res as EnvIaqResult
        return {
          ...body,
          readings: body.readings || input,
          advice: Array.isArray(body.advice) ? body.advice : [],
        } satisfies EnvIaqResult
      },
      cacheTtlMs,
    )
    return { status: 'ok', data }
  } catch (e) {
    return { status: 'error', message: getApiErrorMessage(e, 'IAQ 计算失败') }
  }
}