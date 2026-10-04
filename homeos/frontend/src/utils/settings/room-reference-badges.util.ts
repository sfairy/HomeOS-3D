/**
 * 房间引用徽章工具
 *
 * 职责：
 * - 判定房间是否绑定了环境传感器（温湿度 / PM2.5 / CO2 / TVOC）。
 * - 根据房间已具备的能力生成环境徽章，供房间配置项展示能力摘要。
 *
 * 依赖：无外部依赖，纯函数。
 *
 * 注意：
 * - SENSOR_KEYS 中的 key（temperature / humidity ...）为 HA 属性 key，不翻译。
 * - 徽章 key（env）为能力分类 key，不翻译；label / title 为面向用户文案。
 */
type RoomRefBadgeKey = 'env'

/** 房间能力徽章：含 key、显示文案与悬浮提示 */
type RoomRefBadge = {
  key: RoomRefBadgeKey
  label: string
  title?: string
}

/** 环境传感器属性 key 集合（任一非空即视为已绑定环境能力） */
const SENSOR_KEYS = ['temperature', 'humidity', 'pm25', 'co2', 'tvoc'] as const

/**
 * 判定房间是否绑定了环境传感器。
 *
 * @param entry 房间配置项（如环境映射表的一行）；标记为 _hidden 视为未绑定
 * @returns true 表示存在任一环境传感器字段
 */
export function roomHasEnvSensors(entry: Record<string, unknown> | null | undefined): boolean {
  if (!entry || typeof entry !== 'object') return false
  if (entry._hidden) return false
  return SENSOR_KEYS.some((k) => String(entry[k] || '').trim())
}

/**
 * 根据房间已具备的能力生成徽章列表。
 *
 * @param opts.hasEnv 是否绑定环境传感器
 * @returns 徽章数组（当前仅环境能力）
 */
export function buildRoomReferenceBadges(opts: { hasEnv?: boolean }): RoomRefBadge[] {
  const badges: RoomRefBadge[] = []
  if (opts.hasEnv) {
    badges.push({
      key: 'env',
      label: '环境',
      title: '已绑定环境传感器，环境健康面板可用',
    })
  }
  return badges
}
