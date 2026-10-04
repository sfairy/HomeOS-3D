/**
 * Home Assistant 连接相关常量
 *
 * 职责：
 * - 收敛 HA 连接相关的魔法字符串，避免同一默认值在多处散落。
 * - 当前唯一成员为默认 HA 服务地址（本地 Home Assistant 默认端口 8123）。
 */
export const DEFAULT_HA_URL = 'http://localhost:8123'
