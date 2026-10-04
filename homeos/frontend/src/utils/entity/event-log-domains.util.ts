/**
 * 事件日志浮层实体域集合与补水工具
 *
 * 职责：定义即时消息墙 / 低延迟状态监听的实体域白名单（与 Tier A 控制类设备对齐，
 *      含 light/switch/fan/climate/binary_sensor/lock/cover/media_player/vacuum/water_heater/alarm_control_panel）；
 *      提供事件日志浮层 API 补水用的实体 ID 收集逻辑，优先取用户收藏实体，叠加白名单域实体与全部 binary_sensor，
 *      上限 30 条，保证浮层可展示的实体数据在加载期已同步到前端。
 * 导出：EVENT_LOG_OVERLAY_DOMAINS（常量元组）。
 */

/** 即时消息墙 / 低延迟状态监听实体域（与 Tier A 控制类设备对齐） */
export const EVENT_LOG_OVERLAY_DOMAINS = [
  'light',
  'switch',
  'fan',
  'climate',
  'binary_sensor',
  'lock',
  'cover',
  'media_player',
  'vacuum',
  'water_heater',
  'alarm_control_panel',
] as const satisfies readonly string[]

