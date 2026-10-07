/**
 * HA 实体域（domain）元数据
 *
 * 职责：
 * - 维护 HA 实体域到中文显示名的映射表（ENTITY_DOMAIN_LABELS）。
 * - 维护域 → 主题色映射。
 *
 * 依赖：无外部依赖，纯静态映射。
 *
 * 注意：
 * - 对象 key 为 HA 实体域名（如 light / switch / sensor），属于配置 key，不翻译。
 * - 颜色 value 为 CSS HEX 颜色值，不翻译。
 * - 仅面向用户的标签 value 使用简体中文。
 */
export const ENTITY_DOMAIN_LABELS = {
  alarm_control_panel: '安防',
  automation: '自动化',
  binary_sensor: '二元',
  button: '按钮',
  camera: '摄像头',
  climate: '空调',
  cover: '窗帘',
  device_tracker: '位置',
  event: '事件',
  fan: '风扇',
  humidifier: '加湿器',
  input_boolean: '虚拟开关',
  input_number: '输入值',
  input_select: '输入选择',
  light: '灯光',
  lock: '门锁',
  media_player: '多媒体',
  number: '数值',
  person: '人员',
  remote: '遥控',
  scene: '场景',
  script: '脚本',
  select: '选择',
  sensor: '传感器',
  siren: '警报',
  switch: '开关',
  update: '更新',
  vacuum: '吸尘器',
  valve: '阀门',
  water_heater: '热水器',
  weather: '天气',
}
/** 域 → 主题色（HEX）映射，用于图标 / 徽章 / 浮动控制卡着色 */
export const ENTITY_DOMAIN_COLORS: Record<string, string> = {
  light: '#fbbf24',
  switch: '#60a5fa',
  input_boolean: '#38bdf8',
  button: '#60a5fa',
  input_button: '#60a5fa',
  climate: '#38bdf8',
  fan: '#22d3ee',
  water_heater: '#fb923c',
  cover: '#a78bfa',
  humidifier: '#38bdf8',
  lock: '#fbbf24',
  vacuum: '#c084fc',
  camera: '#fb7185',
  media_player: '#c084fc',
  remote: '#94a3b8',
  sensor: '#34d399',
  binary_sensor: '#4ade80',
  number: '#67e8f9',
  input_number: '#67e8f9',
  select: '#a78bfa',
  input_select: '#a78bfa',
  alarm_control_panel: '#f87171',
  siren: '#fb7185',
  valve: '#2dd4bf',
  scene: '#fbbf24',
  script: '#2dd4bf',
  automation: '#f59e0b',
  device_tracker: '#4ade80',
  person: '#34d399',
  weather: '#38bdf8',
  update: '#94a3b8',
  event: '#22d3ee',
  timer: '#60a5fa',
  counter: '#67e8f9',
}

const DOMAIN_COLOR_FALLBACK = '#94a3b8'

/**
 * 查询 HA 域默认语义色。
 *
 * @param domain - HA 实体域名（如 `light`、`climate`）。
 * @returns HEX 颜色；未收录时回退中性灰。
 */
export function entityDomainColor(domain: string | null | undefined): string {
  if (!domain) return DOMAIN_COLOR_FALLBACK
  return ENTITY_DOMAIN_COLORS[domain] || DOMAIN_COLOR_FALLBACK
}
/**
 * 根据 HA 域名查询中文显示名。
 *
 * @param key - HA 实体域名（如 `light`、`sensor`）。
 * @returns 对应的中文标签；未命中时回退为原始 key。
 */
export function entityDomainLabel(key: string) {
  return (ENTITY_DOMAIN_LABELS as Record<string, string>)[key] ?? key
}
