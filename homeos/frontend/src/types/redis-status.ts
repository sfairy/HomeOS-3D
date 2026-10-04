/**
 * WebSocket / entities.store 侧的 Redis 连接状态。
 * 用于标识 Redis 缓存层的连接健康度。
 */

/** Redis 连接状态枚举（字符串联合类型） */
export type WsRedisStatus =
  | 'unknown' // 未知（尚未探测）
  | 'unavailable' // 不可用（未配置或禁用）
  | 'offline' // 离线（已配置但无法连接）
  | 'error' // 错误（连接异常）
  | 'connected' // 已连接
  | 'ready' // 就绪（可正常读写）
  | string

/** Redis 健康检查视图（UI 展示用） */
export interface RedisHealthView {
  loading: boolean // 是否正在检查
  configured: boolean // 是否已配置 Redis
  ok: boolean // 是否健康
}

/** Redis 健康快照（某一时刻的状态） */
export interface RedisHealthSnapshot {
  configured?: boolean // 是否已配置
  ok?: boolean // 是否健康
}

/** 从 API 获取的 Redis 健康信息 */
export interface RedisHealthFromApi {
  configured: boolean // 是否已配置
  ok: boolean // 是否健康
  status: 'connected' | 'offline' | 'unavailable' // 状态：connected=已连接，offline=离线，unavailable=不可用
}