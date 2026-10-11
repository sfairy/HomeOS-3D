/** 事件日志浮层实体域集合与补水工具 */

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

