/**
 * 实体属性中文标签表与属性面板展示工具
 *
 * 职责：
 * - 维护 HA 常见实体属性 → 中文含义映射（EXTRA_ATTR_LABELS）。
 * - 合并控制事件属性标签（ATTR_CHANGE_LABELS），供属性面板按属性 key 展示中文标签。
 * - 提供属性排序、展示名解析、属性值友好格式化等工具。
 *
 * 依赖：@/utils/entity/control-attr-change.util 的 ATTR_CHANGE_LABELS。
 *
 * 注意：
 * - 属性 key（state / last_changed / ...）为 HA 属性名，不翻译。
 * - 仅面向用户的属性含义标签使用简体中文。
 */
import { ATTR_CHANGE_LABELS } from '@/utils/entity/control-attr-change.util'

/** Home Assistant 常见实体属性 → 中文含义（属性面板优先本表，避免控制事件标签污染） */
const EXTRA_ATTR_LABELS: Record<string, string> = {
  state: '当前状态',
  last_changed: '最近变更',
  last_updated: '最近更新',
  last_triggered: '最近触发',
  last_seen: '最后出现',
  next_dawn: '下次黎明',
  next_dusk: '下次黄昏',
  next_midnight: '下次午夜',
  next_noon: '下次正午',
  next_rising: '下次日出',
  next_setting: '下次日落',
  rising: '日出时间',
  setting: '日落时间',
  elevation: '太阳高度角',
  azimuth: '方位角',
  unit_of_measurement: '计量单位',
  device_class: '设备类别',
  state_class: '状态类别',
  entity_category: '实体类别',
  entity_registry_enabled_default: '默认启用',
  supported_features: '支持功能',
  assumed_state: '假定状态',
  attribution: '数据来源',
  available: '可用',
  restored: '已恢复',
  options: '可选项',
  min: '最小值',
  max: '最大值',
  step: '步进',
  mode: '模式',
  editable: '可编辑',
  initial: '初始值',
  battery: '电池供电',
  battery_level: '电量',
  battery_low: '低电量',
  charging: '充电中',
  voltage: '电压',
  current: '电流',
  power: '功率',
  energy: '能耗',
  today: '今日',
  this_month: '本月',
  total: '累计',
  linkquality: '信号质量',
  rssi: '信号强度',
  signal_strength: '信号强度',
  brightness: '亮度',
  brightness_pct: '亮度百分比',
  transition: '过渡时间',
  color_mode: '颜色模式',
  color_temp: '色温',
  color_temp_kelvin: '色温(K)',
  rgb_color: 'RGB 颜色',
  hs_color: 'HS 颜色',
  xy_color: 'XY 颜色',
  effect: '灯效',
  effect_list: '灯效列表',
  white_value: '暖白值',
  supported_color_modes: '支持颜色模式',
  hvac_mode: '运行模式',
  hvac_modes: '运行模式列表',
  hvac_action: '当前动作',
  hvac_state: 'HVAC 状态',
  preset_mode: '预设模式',
  preset_modes: '预设列表',
  swing_mode: '摆风模式',
  swing_modes: '摆风列表',
  fan_mode: '风速模式',
  fan_modes: '风速列表',
  fan_speed: '吸力',
  fan_speed_list: '吸力档位',
  target_temp_step: '温度步进',
  min_temp: '最低温度',
  max_temp: '最高温度',
  min_humidity: '最低湿度',
  max_humidity: '最高湿度',
  current_humidity: '当前湿度',
  current_temperature: '当前温度',
  target_temperature: '目标温度',
  target_humidity: '目标湿度',
  temperature: '温度',
  humidity: '湿度',
  dew_point: '露点',
  apparent_temperature: '体感温度',
  cloud_coverage: '云量',
  uv_index: '紫外线指数',
  pressure: '气压',
  wind_speed: '风速',
  wind_bearing: '风向',
  visibility: '能见度',
  precipitation: '降水量',
  illuminance: '照度',
  co2: '二氧化碳',
  pm25: 'PM2.5',
  pm2_5: 'PM2.5',
  voc: '挥发性有机物',
  aqi: '空气质量指数',
  ozone: '臭氧',
  temperature_unit: '温度单位',
  pressure_unit: '气压单位',
  wind_speed_unit: '风速单位',
  precipitation_unit: '降水单位',
  visibility_unit: '能见度单位',
  media_title: '媒体标题',
  media_artist: '艺术家',
  media_album_name: '专辑',
  media_content_type: '内容类型',
  media_content_id: '媒体 ID',
  media_series_title: '剧集',
  media_episode: '集数',
  media_channel: '频道',
  media_duration: '时长',
  media_position: '播放位置',
  media_position_updated_at: '进度更新时间',
  app_name: '应用名称',
  is_volume_muted: '静音',
  volume_level: '音量',
  source: '来源',
  source_list: '来源列表',
  sound_mode: '音效模式',
  sound_mode_list: '音效列表',
  shuffle: '随机播放',
  repeat: '循环模式',
  group_members: '组成员',
  current_position: '当前位置',
  current_tilt_position: '当前倾斜',
  position: '位置',
  tilt_position: '倾斜位置',
  percentage: '百分比',
  percentage_step: '风速步进',
  max_percentage: '最大百分比',
  min_percentage: '最小百分比',
  speed: '速度',
  speed_count: '风速档位',
  direction: '方向',
  oscillating: '摆头',
  timer_status: '定时状态',
  timer_hours: '定时时长',
  timer_option: '定时选项',
  timer_preset_modes: '定时预设',
  timer_remaining: '定时剩余',
  filter_life: '滤芯寿命',
  filter_hours_used: '滤芯已用',
  cleaned_area: '已清扫面积',
  cleaning_time: '清扫时长',
  current_activity: '当前活动',
  activity_list: '活动列表',
  code_format: '编码格式',
  code_arm_required: '需布防码',
  changed_by: '变更来源',
  trigger: '触发器',
  automation: '自动化',
  id: '标识',
  icon: '图标',
  entity_picture: '实体图片',
  access_token: '访问令牌',
  area_id: '区域 ID',
  area_name: '区域名称',
  device_id: '设备 ID',
  friendly_name: '友好名称',
  ip_address: 'IP 地址',
  host: '主机',
  mac: 'MAC 地址',
  model: '型号',
  manufacturer: '制造商',
  sw_version: '软件版本',
  hw_version: '硬件版本',
  serial_number: '序列号',
  motion: '移动检测',
  occupancy: '占用检测',
  presence: '存在检测',
  contact: '门窗状态',
  tamper: '防拆',
  smoke: '烟雾',
  gas: '燃气',
  moisture: '潮湿',
  vibration: '震动',
  opening: '开度',
  moving: '运动中',
  gps_accuracy: 'GPS 精度',
  latitude: '纬度',
  longitude: '经度',
  altitude: '海拔',
  course: '航向',
  speed_kmh: '速度(km/h)',
  wifi: 'Wi-Fi',
  ethernet: '以太网',
  connection_type: '连接类型',
  stream_type: '流类型',
  frontend_stream_type: '前端流类型',
  motion_detection: '移动侦测',
  brand: '品牌',
  integration: '集成',
  via_device: '经由设备',
  event_type: '事件类型',
  event_types: '事件类型',
  event: '事件',
  events: '事件列表',
  current_time: '当前时间',
  timestamp: '时间戳',
  time: '时间',
  face_recognition: '人脸识别',
  face_recognition_mark: '人脸识别标记',
  face_mark: '人脸识别标记',
  person_detected: '检测到人',
  human_detected: '检测到人形',
  face_detected: '检测到人脸',
  forecast: '天气预报',
  min_color_temp_kelvin: '最低色温(K)',
  max_color_temp_kelvin: '最高色温(K)',
  min_mireds: '最低色温(mired)',
  max_mireds: '最高色温(mired)',
  remaining: '剩余时长',
  remaining_time: '剩余时长',
  duration: '时长',
  operation_mode: '运行模式',
  operation_list: '运行模式列表',
  available_modes: '可用模式',
}

type EntityAttrLabel = {
  key: string
  zh: string
  en: string
}

/** 获取属性中英文标签（属性面板优先 EXTRA，避免「目标温度/风速」等控制文案污染） */
function getEntityAttrLabel(key: string): EntityAttrLabel {
  const en = key.trim()
  const zh = EXTRA_ATTR_LABELS[en] ?? ATTR_CHANGE_LABELS[en] ?? humanizeAttrKey(en)
  return { key: en, zh, en }
}

/**
 * 双语展示：中文为主，英文 key 为辅。
 * 传入 domain/attributes 时可消歧义（如 climate 的 temperature = 目标温度）。
 */
export function formatEntityAttrLabel(
  key: string,
  ctx?: { domain?: string; attributes?: Record<string, unknown> },
): { primary: string; secondary: string } {
  const { zh, en } = getEntityAttrLabel(key)
  const domain = ctx?.domain || ''
  const attrs = ctx?.attributes
  let primary = zh

  // HA climate/water_heater：temperature 表示设定值；有 current_temperature 时更应标为「目标温度」
  if (key === 'temperature') {
    const hasCurrent = attrs?.current_temperature != null
    if (hasCurrent || domain === 'climate' || domain === 'water_heater') {
      primary = '目标温度'
    }
  }
  // climate：humidity 常为设定湿度（与 current_humidity 成对）
  if (key === 'humidity' && attrs?.current_humidity != null && domain === 'climate') {
    primary = '目标湿度'
  }

  return {
    primary,
    secondary: en === primary ? '' : en,
  }
}

/** 搜索匹配（中/英 key + 值） */
export function matchesEntityAttrSearch(key: string, value: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const { zh, en } = getEntityAttrLabel(key)
  return (
    en.toLowerCase().includes(q) || zh.toLowerCase().includes(q) || value.toLowerCase().includes(q)
  )
}

function humanizeAttrKey(key: string): string {
  if (/[\u4e00-\u9fff]/.test(key)) return key
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
