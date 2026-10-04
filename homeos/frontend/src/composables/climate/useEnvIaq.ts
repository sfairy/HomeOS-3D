/**
 * @file 环境 IAQ（室内空气质量）请求 Composable
 * @module composables/climate/useEnvIaq
 * @description
 *   提供 带 dedupe 缓存的环境 IAQ 计算请求，由 EnvironmentHealth 与 ComfortScore 共用。
 *   通过 sharedFetch 实现相同输入的请求去重与 TTL 缓存，避免短时间重复调用后端。
 *   依赖：@/services/api/system 的 calculateEnvIaq、@/utils/core/poll-scheduler 的 sharedFetch、
 *   @/utils/climate/env-score.util 的传感器数据收集与结果类型。
 */

/** ENV_IAQ_CACHE_PREFIX：常量，取值语义见定义处。 */
export const ENV_IAQ_CACHE_PREFIX = 'rest:POST:/environment/iaq:'



