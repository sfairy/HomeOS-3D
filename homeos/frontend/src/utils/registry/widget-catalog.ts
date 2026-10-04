/**
 * 微件目录与 Builder 域服务工具
 *
 * 职责：
 * - 转发 widget-registry-meta 中的微件元数据 / 目录分组 / 图标 / 类名等查询能力。
 * - 维护 HA domain → service 列表映射表（DOMAIN_SERVICES），供微件 Builder
 *   在「按域选服务」时使用，避免对未知域下发空列表。
 *
 * 依赖：./widget-registry-meta。
 *
 * 注意：domain key（light / switch / cover ...）与 service 名（turn_on /
 *   set_temperature ...）为 HA 标识符，不翻译。
 */
export {
  getWidgetCategoryLabelForType,
  getSidebarWidgetCatalogGroups,
  getDashboardWidgetCatalogGroups,
  FLOATING_HUB_WIDTH_MAP,
  FLOATING_HUB_TYPE_SET,
  getFloatingCatalogGroups,
  getWidgetIcon,
  getWidgetName,
  canonicalizeWidgetType,
} from './widget-registry-meta'

/**
 * HA domain → 该域支持的服务名列表（Builder 按域选服务时使用）。
 *
 * value 中的服务名为 HA service 名（如 turn_on / set_temperature），不翻译。
 */
export const DOMAIN_SERVICES: Record<string, string[]> = {
  light: ['turn_on', 'turn_off', 'toggle'],
  switch: ['turn_on', 'turn_off', 'toggle'],
  cover: ['open_cover', 'close_cover', 'stop_cover', 'set_cover_position', 'toggle'],
  climate: ['set_temperature', 'set_hvac_mode', 'turn_on', 'turn_off'],
  media_player: [
    'media_play',
    'media_pause',
    'media_stop',
    'volume_set',
    'volume_up',
    'volume_down',
    'turn_on',
    'turn_off',
  ],
  lock: ['lock', 'unlock', 'open'],
  vacuum: [
    'start',
    'pause',
    'stop',
    'return_to_base',
    'locate',
    'clean_spot',
    'set_fan_speed',
    'send_command',
  ],
  fan: ['turn_on', 'turn_off', 'set_percentage', 'toggle'],
  alarm_control_panel: ['alarm_arm_home', 'alarm_arm_away', 'alarm_arm_night', 'alarm_disarm'],
  scene: ['turn_on'],
  script: ['turn_on', 'reload'],
  automation: ['turn_on', 'turn_off', 'trigger', 'reload'],
  input_boolean: ['turn_on', 'turn_off', 'toggle'],
  input_number: ['set_value', 'increment', 'decrement'],
  input_select: ['select_option', 'select_next', 'select_previous'],
  notify: ['send_message'],
  persistent_notification: ['create', 'dismiss'],
  timer: ['start', 'pause', 'cancel', 'finish'],
  counter: ['increment', 'decrement', 'reset'],
  valve: ['turn_on', 'turn_off', 'toggle'],
  humidifier: ['turn_on', 'turn_off', 'set_humidity', 'set_mode'],
  water_heater: ['turn_on', 'turn_off', 'set_temperature'],
}

/**
 * 查询指定 domain 支持的 service 列表。
 *
 * @param domain HA 域名
 * @returns service 名数组；未命中时返回空数组
 */
export function servicesForDomain(domain: string) {
  return DOMAIN_SERVICES[domain] || []
}

/**
 * Builder 用：未知 domain 回退通用服务列表（turn_on / turn_off / toggle）。
 *
 * @param domain HA 域名
 * @returns service 名数组；未命中时回退通用三件套
 */
export function servicesForDomainBuilder(domain: string) {
  return DOMAIN_SERVICES[domain] || ['turn_on', 'turn_off', 'toggle']
}
