/**
 * HA 实体域（domain）元数据
 *
 * 职责：
 * - 维护 HA 实体域到中文显示名的映射表（ENTITY_DOMAIN_LABELS）。
 * - 维护域分组标签与分组定义（控件 / 环境 / 智能 / 安全 / 传感 / 其他）。
 * - 维护常用域的 SVG 图标路径与主题色。
 *
 * 依赖：无外部依赖，纯静态映射。
 *
 * 注意：
 * - 对象 key 为 HA 实体域名（如 light / switch / sensor），属于配置 key，不翻译。
 * - `iconPaths` 为 SVG path 的 `d` 属性片段，不翻译。
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
/** 域分组 key → 中文分组标签（all / control / env / smart / safety / sense / other） */
export const ENTITY_DOMAIN_GROUP_LABELS = {
  all: '全部设备',
  control: '控件',
  env: '环境',
  other: '其他',
  safety: '安全',
  sense: '传感',
  smart: '智能',
}
/** 域分组定义：每组包含分组 key、SVG 图标路径片段与所含域名列表 */
export const ENTITY_DOMAIN_GROUPS = [
  {
    key: 'control',
    iconPaths:
      '<line x1="8" y1="6" x2="16" y2="6"/><line x1="12" y1="2" x2="12" y2="6"/><path d="M5 10h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"/><path d="m8 15 2 2 4-4"/>',
    domains: ['light', 'switch', 'input_boolean', 'button'],
  },
  {
    key: 'env',
    iconPaths:
      '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    domains: ['climate', 'fan', 'water_heater', 'cover', 'humidifier'],
  },
  {
    key: 'smart',
    iconPaths:
      '<rect x="2" y="2" width="20" height="20" rx="5"/><path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="1"/>',
    domains: ['media_player', 'lock', 'vacuum', 'camera'],
  },
  {
    key: 'safety',
    iconPaths: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    domains: ['alarm_control_panel', 'siren', 'scene', 'script', 'automation'],
  },
  {
    key: 'sense',
    iconPaths:
      '<circle cx="12" cy="12" r="2"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/>',
    domains: [
      'sensor',
      'binary_sensor',
      'number',
      'input_number',
      'select',
      'input_select',
      'device_tracker',
      'person',
      'weather',
      'update',
      'event',
    ],
  },
  {
    key: 'other',
    iconPaths:
      '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
    domains: ['remote', 'valve'],
  },
]
/** 常用域的 SVG 图标路径（path 的 d 属性片段） */
export const ENTITY_DOMAIN_ICONS = {
  light:
    '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  switch: '<rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="8" cy="12" r="3"/>',
  sensor:
    '<path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/><circle cx="12" cy="12" r="2"/>',
  climate: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  media_player:
    '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  camera: '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  humidifier: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
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
