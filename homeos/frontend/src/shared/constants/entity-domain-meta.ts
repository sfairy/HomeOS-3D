/** HA 实体域（domain）元数据 */
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
  // 统一暖铜主控色板：可操作设备 → 暖铜，环境感知 → 青绿，安防 → 珊瑚红，
  // 媒体/生活 → 信息青，离线/元数据 → 中性灰。域仍可区分，但不再出现 30 种彩虹色。
  light: '#ffc46a',
  switch: '#ffc46a',
  input_boolean: '#e09523',
  button: '#ffc46a',
  input_button: '#ffc46a',
  climate: '#59d3c0',
  fan: '#59d3c0',
  water_heater: '#ffb020',
  cover: '#ffd9a0',
  humidifier: '#59d3c0',
  lock: '#ffc46a',
  vacuum: '#e09523',
  camera: '#ff5a5f',
  media_player: '#59d3c0',
  remote: '#a7b4c2',
  sensor: '#3ddc97',
  binary_sensor: '#3ddc97',
  number: '#59d3c0',
  input_number: '#59d3c0',
  select: '#ffd9a0',
  input_select: '#ffd9a0',
  alarm_control_panel: '#ff5a5f',
  siren: '#ff5a5f',
  valve: '#59d3c0',
  scene: '#ffc46a',
  script: '#3ddc97',
  automation: '#ffb020',
  device_tracker: '#3ddc97',
  person: '#3ddc97',
  weather: '#59d3c0',
  update: '#a7b4c2',
  event: '#59d3c0',
  timer: '#ffc46a',
  counter: '#59d3c0',
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
